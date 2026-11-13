import { t } from '../i18n';
import { unknownIdentifiers } from './constraint-suggestions';
import { defaultValueProblem } from './default-values';
import { DIALECTS, findType, isEnum, maxLengthFor, RESERVED_WORDS } from './dialects';
import { isRecursive } from './model';
import type { Issue, Project, Schema } from './types';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Naming, typing and modelling checks on top of the structural issues found by buildSchema. */
export const validateProject = (project: Project, schema: Schema): Issue[] => {
  const issues: Issue[] = [...schema.issues];
  const dialect = DIALECTS[project.dialect];

  const tableNames = new Map<string, number>();
  for (const table of schema.tables) {
    const key = table.name.trim().toLowerCase();
    tableNames.set(key, (tableNames.get(key) ?? 0) + 1);
  }

  for (const table of schema.tables) {
    const name = table.name.trim();
    if (!name) {
      issues.push({ level: 'error', message: t('issue.unnamedTable'), entityId: table.id });
    } else if ((tableNames.get(name.toLowerCase()) ?? 0) > 1) {
      issues.push({ level: 'error', message: t('issue.duplicateTable', { name }), entityId: table.id });
    } else if (RESERVED_WORDS.has(name.toUpperCase())) {
      issues.push({ level: 'warning', message: t('issue.reservedTable', { name }), entityId: table.id });
    } else if (!IDENTIFIER.test(name)) {
      issues.push({ level: 'warning', message: t('issue.specialChars', { name }), entityId: table.id });
    }

    const columnNames = new Map<string, number>();
    for (const col of table.columns) {
      const key = col.name.trim().toLowerCase();
      columnNames.set(key, (columnNames.get(key) ?? 0) + 1);
    }
    for (const col of table.columns) {
      if (col.origin !== 'attribute') continue;
      const colName = col.name.trim();
      const column = `${name}.${colName}`;
      if (!colName) {
        issues.push({ level: 'error', message: t('issue.unnamedAttribute', { table: name }), entityId: table.id });
      } else if ((columnNames.get(colName.toLowerCase()) ?? 0) > 1) {
        issues.push({ level: 'error', message: t('issue.duplicateColumn', { column: colName, table: name }), entityId: table.id });
      } else if (RESERVED_WORDS.has(colName.toUpperCase())) {
        issues.push({ level: 'warning', message: t('issue.reservedColumn', { column }), entityId: table.id });
      }
      const def = findType(dialect, col.type);
      if (isEnum(col.type)) {
        const values = col.enumValues ?? [];
        if (values.length === 0) {
          issues.push({ level: 'error', message: t('issue.enumEmpty', { column }), entityId: table.id });
        } else if (values.some((v) => !v.trim())) {
          issues.push({ level: 'error', message: t('issue.enumBlank', { column }), entityId: table.id });
        } else if (new Set(values).size < values.length) {
          issues.push({ level: 'warning', message: t('issue.enumRepeated', { column }), entityId: table.id });
        }
        const fallback = col.defaultValue?.trim();
        if (values.length && fallback && fallback.toUpperCase() !== 'NULL') {
          const literal = fallback.replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");
          if (!values.includes(literal)) {
            issues.push({
              level: 'error',
              message: t('issue.enumDefault', { column, value: fallback, allowed: values.join(', ') }),
              entityId: table.id,
            });
          }
        }
      }
      if (def?.params === 'length') {
        const max = maxLengthFor(project.dialect, col.type);
        if (col.length != null && col.length < 1) {
          issues.push({ level: 'error', message: t('issue.lengthPositive', { column, type: col.type }), entityId: table.id });
        } else if (max && col.length != null && col.length > max) {
          issues.push({
            level: 'error',
            message: t('issue.lengthMax', { column, dialect: dialect.name, type: col.type, max }),
            entityId: table.id,
          });
        }
      }
      const problem = defaultValueProblem(project.dialect, col);
      if (problem) {
        const value = col.defaultValue!.trim();
        const keys = {
          unquotedText: 'issue.defaultUnquotedText',
          notANumber: 'issue.defaultNotANumber',
          notABoolean: 'issue.defaultNotABoolean',
          unquotedDate: 'issue.defaultUnquotedDate',
        } as const;
        issues.push({ level: 'warning', message: t(keys[problem], { column, value, dialect: dialect.name }), entityId: table.id });
      }
      if (col.check?.trim()) {
        const unknown = unknownIdentifiers(col.check, table.columns.map((c) => c.name));
        if (unknown.length) issues.push({ level: 'warning', message: t('issue.checkUnknown', { column, names: unknown.join(', '), table: name }), entityId: table.id });
        if (project.dialect === 'sqlite' && /\bREGEXP\b/i.test(col.check)) {
          issues.push({ level: 'warning', message: t('issue.sqliteRegexp', { column }), entityId: table.id });
        }
      }
      if (!def) {
        issues.push({
          level: 'warning',
          message: t('issue.customType', { column, type: col.type, dialect: dialect.name }),
          entityId: table.id,
        });
      }
    }

    const signatures = new Map<string, string>();
    const pkSignature = table.pk?.columnIds.join('|');
    for (const index of table.indexes) {
      const signature = index.columns.map((c) => c.columnId).join('|');
      if (index.columns.length === 0) {
        issues.push({ level: 'warning', message: t('issue.indexNoColumns', { index: index.name }), entityId: table.id });
        continue;
      }
      const duplicate = signatures.get(signature);
      if (duplicate) {
        issues.push({
          level: 'warning',
          message: t('issue.indexDuplicate', { a: duplicate, b: index.name }),
          entityId: table.id,
        });
      }
      signatures.set(signature, index.name);
      if (pkSignature && pkSignature.startsWith(signature)) {
        issues.push({
          level: 'warning',
          message: t('issue.indexRedundant', { index: index.name, table: name }),
          entityId: table.id,
        });
      }
      if (index.where?.trim()) {
        const unknown = unknownIdentifiers(index.where, table.columns.map((c) => c.name));
        if (unknown.length) {
          issues.push({ level: 'warning', message: t('issue.whereUnknown', { index: index.name, names: unknown.join(', '), table: name }), entityId: table.id });
        }
      }
      if (index.where?.trim() && !dialect.supportsPartialIndex) {
        issues.push({
          level: 'warning',
          message: t('issue.noPartialIndex', { dialect: dialect.name, index: index.name }),
          entityId: table.id,
        });
      }
    }
  }

  const indexNames = new Map<string, number>();
  for (const table of schema.tables) {
    for (const index of table.indexes) {
      const key = index.name.toLowerCase();
      indexNames.set(key, (indexNames.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of indexNames) {
    if (count > 1) issues.push({ level: 'error', message: t('issue.duplicateIndexName', { name: key }) });
  }

  for (const rel of project.relationships) {
    if (!isRecursive(rel)) continue;
    const seen = new Map<string, string[]>();
    for (const p of rel.participants) {
      const list = seen.get(p.entityId) ?? [];
      list.push(p.role?.trim().toLowerCase() ?? '');
      seen.set(p.entityId, list);
    }
    for (const roles of seen.values()) {
      if (roles.length < 2) continue;
      if (roles.some((r) => !r)) {
        issues.push({
          level: 'error',
          message: t('issue.recursiveRoles'),
          relationshipId: rel.id,
        });
      } else if (new Set(roles).size < roles.length) {
        issues.push({ level: 'error', message: t('issue.recursiveRolesDistinct'), relationshipId: rel.id });
      }
    }
  }

  return issues;
};
