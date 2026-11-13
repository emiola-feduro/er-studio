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
      issues.push({ level: 'error', message: 'Hay una tabla sin nombre.', entityId: table.id });
    } else if ((tableNames.get(name.toLowerCase()) ?? 0) > 1) {
      issues.push({ level: 'error', message: `Nombre de tabla duplicado: "${name}".`, entityId: table.id });
    } else if (RESERVED_WORDS.has(name.toUpperCase())) {
      issues.push({ level: 'warning', message: `"${name}" es palabra reservada; se escribirá entre comillas.`, entityId: table.id });
    } else if (!IDENTIFIER.test(name)) {
      issues.push({ level: 'warning', message: `"${name}" tiene caracteres especiales; se escribirá entre comillas.`, entityId: table.id });
    }

    const columnNames = new Map<string, number>();
    for (const col of table.columns) {
      const key = col.name.trim().toLowerCase();
      columnNames.set(key, (columnNames.get(key) ?? 0) + 1);
    }
    for (const col of table.columns) {
      if (col.origin !== 'attribute') continue;
      const colName = col.name.trim();
      if (!colName) {
        issues.push({ level: 'error', message: `"${name}" tiene un atributo sin nombre.`, entityId: table.id });
      } else if ((columnNames.get(colName.toLowerCase()) ?? 0) > 1) {
        issues.push({ level: 'error', message: `Columna duplicada "${colName}" en "${name}".`, entityId: table.id });
      } else if (RESERVED_WORDS.has(colName.toUpperCase())) {
        issues.push({ level: 'warning', message: `"${name}.${colName}" es palabra reservada.`, entityId: table.id });
      }
      const def = findType(dialect, col.type);
      if (isEnum(col.type)) {
        const values = col.enumValues ?? [];
        if (values.length === 0) {
          issues.push({ level: 'error', message: `"${name}.${colName}" es ENUM pero no tiene valores permitidos.`, entityId: table.id });
        } else if (values.some((v) => !v.trim())) {
          issues.push({ level: 'error', message: `"${name}.${colName}" tiene un valor ENUM vacío.`, entityId: table.id });
        } else if (new Set(values).size < values.length) {
          issues.push({ level: 'warning', message: `"${name}.${colName}" repite valores en el ENUM.`, entityId: table.id });
        }
        const fallback = col.defaultValue?.trim();
        if (values.length && fallback && fallback.toUpperCase() !== 'NULL') {
          const literal = fallback.replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");
          if (!values.includes(literal)) {
            issues.push({
              level: 'error',
              message: `"${name}.${colName}": el valor por defecto ${fallback} no está entre los permitidos (${values.join(', ')}).`,
              entityId: table.id,
            });
          }
        }
      }
      if (def?.params === 'length') {
        const max = maxLengthFor(project.dialect, col.type);
        if (col.length != null && col.length < 1) {
          issues.push({ level: 'error', message: `"${name}.${colName}": el límite de ${col.type} debe ser mayor que 0.`, entityId: table.id });
        } else if (max && col.length != null && col.length > max) {
          issues.push({
            level: 'error',
            message: `"${name}.${colName}": ${dialect.name} admite como máximo ${col.type}(${max}).`,
            entityId: table.id,
          });
        }
      }
      const problem = defaultValueProblem(project.dialect, col);
      if (problem) {
        const value = col.defaultValue!.trim();
        const messages = {
          unquotedText: `"${name}.${colName}": el texto por defecto va entre comillas simples: '${value}'.`,
          notANumber: `"${name}.${colName}": el valor por defecto ${value} no es un número.`,
          notABoolean: `"${name}.${colName}": el valor por defecto ${value} no es un booleano válido en ${dialect.name}.`,
          unquotedDate: `"${name}.${colName}": las fechas por defecto van entre comillas simples: '${value}'.`,
        };
        issues.push({ level: 'warning', message: messages[problem], entityId: table.id });
      }
      if (!def) {
        issues.push({
          level: 'warning',
          message: `"${name}.${colName}" usa el tipo personalizado ${col.type}, que no está en el catálogo de ${dialect.name}.`,
          entityId: table.id,
        });
      }
    }

    const signatures = new Map<string, string>();
    const pkSignature = table.pk?.columnIds.join('|');
    for (const index of table.indexes) {
      const signature = index.columns.map((c) => c.columnId).join('|');
      if (index.columns.length === 0) {
        issues.push({ level: 'warning', message: `El índice "${index.name}" no tiene columnas.`, entityId: table.id });
        continue;
      }
      const duplicate = signatures.get(signature);
      if (duplicate) {
        issues.push({
          level: 'warning',
          message: `Los índices "${duplicate}" y "${index.name}" cubren las mismas columnas.`,
          entityId: table.id,
        });
      }
      signatures.set(signature, index.name);
      if (pkSignature && pkSignature.startsWith(signature)) {
        issues.push({
          level: 'warning',
          message: `El índice "${index.name}" es redundante: la PK de "${name}" ya lo cubre.`,
          entityId: table.id,
        });
      }
      if (index.where?.trim() && !dialect.supportsPartialIndex) {
        issues.push({
          level: 'warning',
          message: `${dialect.name} no soporta índices parciales ("${index.name}").`,
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
    if (count > 1) issues.push({ level: 'error', message: `Nombre de índice duplicado: "${key}".` });
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
          message: 'En una relación recursiva cada participante necesita un rol (por ejemplo jefe y subordinado).',
          relationshipId: rel.id,
        });
      } else if (new Set(roles).size < roles.length) {
        issues.push({ level: 'error', message: 'Los roles de una relación recursiva deben ser distintos.', relationshipId: rel.id });
      }
    }
  }

  return issues;
};
