import { DIALECTS, findType, isSerial } from './dialects';
import { singularize } from './naming';
import type { Column, Project, Schema, SpecializationMapping, Table } from './types';

/**
 * Design review: good-practice findings on top of the validation errors. Each finding names a rule,
 * the table and the values its message needs, so the interface can word it in any language, and some
 * carry a quick fix.
 */

export type ReviewRule =
  | 'fkWithoutIndex'
  | 'noNaturalKey'
  | 'repeatedColumns'
  | 'redundantColumn'
  | 'repeatingGroup'
  | 'multiValued'
  | 'partialDependency'
  | 'wideTable'
  | 'specEmptySubtype'
  | 'specSparseSingleTable'
  | 'specConcreteReferenced'
  | 'specFromOneToOne';

export type ReviewFix =
  | { kind: 'createIndex'; tableId: string; columnIds: string[] }
  | { kind: 'makeUnique'; entityId: string; attributeId: string }
  | { kind: 'specMapping'; specId: string; mapping: SpecializationMapping }
  | { kind: 'specFromRelationship'; relationshipId: string };

export type Finding = {
  /** Stable id, so a dismissed finding stays dismissed while the model does not change it. */
  id: string;
  rule: ReviewRule;
  severity: 'warning' | 'info';
  tableId: string;
  params: Record<string, string | number>;
  fix?: ReviewFix;
};

const WIDE_TABLE = 25;

/** Columns that legitimately appear in many tables and say nothing about duplicated data. */
const COMMON = new Set(
  `id nombre name descripcion description estado status activo active notas notes nota note tipo type titulo title
   creado_en created_at creado created actualizado_en updated_at actualizado updated eliminado_en deleted_at fecha date
   cree_le criado_em modifie_le atualizado_em codigo code`.split(/\s+/),
);

/** Names that usually hold a natural key worth making unique. */
const NATURAL_KEY = /(^|_)(email|correo|courriel|codigo|code|sku|isbn|slug|username|usuario|login|dni|rut|cedula|nif|cpf|pasaporte|passport|passeport|matricula|registration|placa|plate|iata|codigo_iata|iata_code|licencia|license|numero|number)$/;

/** Column names that suggest a list of values in one field. */
const LIST_NAME = /(^|_)(tags|etiquetas|emails|correos|telefonos|phones|telephones|telefones|ids|lista|list|valores|values|items|elementos)$|_ids$/;

const isSurrogate = (project: Project, column: Column) => {
  const generic = findType(DIALECTS[project.dialect], column.type)?.generic;
  return column.autoIncrement || isSerial(project.dialect, column.type) || generic === 'uuid' || /^id$/i.test(column.name);
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** True when some index, the PK or a UNIQUE starts with exactly these columns, in any order. */
const isCovered = (table: Table, columnIds: string[]) => {
  const leads = (ids: string[]) => sameSet(ids.slice(0, columnIds.length), columnIds);
  if (table.pk && leads(table.pk.columnIds)) return true;
  if (table.uniques.some((u) => leads(u.columnIds))) return true;
  if (columnIds.length === 1 && table.columns.find((c) => c.id === columnIds[0])?.unique) return true;
  return table.indexes.some((index) => leads(index.columns.map((c) => c.columnId)));
};

const names = (table: Table, ids: string[]) => ids.map((id) => table.columns.find((c) => c.id === id)?.name ?? '?').join(', ');

export const reviewDesign = (project: Project, schema: Schema): Finding[] => {
  const findings: Finding[] = [];
  const locale = project.namesLocale ?? 'es';
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const attributeColumns = (table: Table) => table.columns.filter((c) => c.origin === 'attribute' && !c.pk);

  for (const table of schema.tables) {
    // FK without index: joins and deletes on the referenced table scan the whole table.
    // MySQL (InnoDB) creates that index by itself, so the rule does not apply there.
    if (project.dialect !== 'mysql') {
      for (const fk of table.foreignKeys) {
        if (isCovered(table, fk.columnIds)) continue;
        findings.push({
          id: `fkWithoutIndex:${fk.id}`,
          rule: 'fkWithoutIndex',
          severity: 'warning',
          tableId: table.id,
          params: { table: table.name, fk: fk.name, columns: names(table, fk.columnIds), ref: tables.get(fk.refTableId)?.name ?? '?' },
          fix: { kind: 'createIndex', tableId: table.id, columnIds: fk.columnIds },
        });
      }
    }

    // Only a surrogate key: nothing stops two rows describing the same thing.
    const pkColumns = (table.pk?.columnIds ?? []).map((id) => table.columns.find((c) => c.id === id)).filter((c): c is Column => Boolean(c));
    const attributes = attributeColumns(table);
    if (table.kind === 'entity' && pkColumns.length === 1 && isSurrogate(project, pkColumns[0]) && attributes.length > 0) {
      const hasAlternateKey = table.columns.some((c) => c.unique && !c.pk && c.origin === 'attribute') || table.uniques.some((u) => u.columnIds.some((id) => table.columns.find((c) => c.id === id)?.origin === 'attribute'));
      if (!hasAlternateKey) {
        const candidate = attributes.find((c) => NATURAL_KEY.test(c.name.toLowerCase()));
        findings.push({
          id: `noNaturalKey:${table.id}`,
          rule: 'noNaturalKey',
          severity: 'info',
          tableId: table.id,
          params: { table: table.name, pk: pkColumns[0].name, candidate: candidate?.name ?? '' },
          ...(candidate ? { fix: { kind: 'makeUnique' as const, entityId: table.id, attributeId: candidate.id } } : {}),
        });
      }
    }

    // 1NF: numbered columns (telefono1, telefono2) are a repeating group.
    const groups = new Map<string, Column[]>();
    for (const column of attributes) {
      const match = /^(.*?)_?(\d+)$/.exec(column.name);
      if (!match || !match[1]) continue;
      const key = match[1].toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), column]);
    }
    for (const [base, columns] of groups) {
      if (columns.length < 2) continue;
      findings.push({
        id: `repeatingGroup:${table.id}:${base}`,
        rule: 'repeatingGroup',
        severity: 'warning',
        tableId: table.id,
        params: { table: table.name, columns: columns.map((c) => c.name).join(', ') },
      });
    }

    // 1NF: a text column named like a list (tags, emails) probably stores several values.
    for (const column of attributes) {
      const generic = findType(DIALECTS[project.dialect], column.type)?.generic;
      if (!generic || !['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext', 'json'].includes(generic)) continue;
      if (!LIST_NAME.test(column.name.toLowerCase())) continue;
      findings.push({ id: `multiValued:${table.id}:${column.id}`, rule: 'multiValued', severity: 'warning', tableId: table.id, params: { table: table.name, column: column.name } });
    }

    // 3NF: a column that copies a value of the referenced table (cliente_nombre next to cliente_id).
    for (const fk of table.foreignKeys) {
      const ref = tables.get(fk.refTableId);
      if (!ref || ref.id === table.id) continue;
      const refName = singularize(ref.name, locale).toLowerCase();
      for (const refColumn of attributeColumns(ref)) {
        const col = refColumn.name.toLowerCase();
        const copy = attributes.find((c) => [`${refName}_${col}`, `${col}_${refName}`].includes(c.name.toLowerCase()));
        if (!copy) continue;
        findings.push({
          id: `redundantColumn:${table.id}:${copy.id}`,
          rule: 'redundantColumn',
          severity: 'warning',
          tableId: table.id,
          params: { table: table.name, column: copy.name, ref: ref.name, refColumn: refColumn.name, fk: names(table, fk.columnIds) },
        });
      }
    }

    // 2NF: with a composite key, a column named after one of the referenced tables depends on part of the key.
    if ((table.pk?.columnIds.length ?? 0) > 1) {
      const keyFks = table.foreignKeys.filter((fk) => fk.columnIds.every((id) => table.pk!.columnIds.includes(id)));
      for (const fk of keyFks) {
        const ref = tables.get(fk.refTableId);
        if (!ref) continue;
        const refName = singularize(ref.name, locale).toLowerCase();
        const refColumns = new Set(attributeColumns(ref).map((c) => c.name.toLowerCase()));
        for (const column of attributes) {
          const name = column.name.toLowerCase();
          const prefixed = name.startsWith(`${refName}_`) || name.endsWith(`_${refName}`);
          const copied = refColumns.has(name) && !COMMON.has(name);
          if (!prefixed && !copied) continue;
          if (findings.some((f) => f.id === `redundantColumn:${table.id}:${column.id}`)) continue;
          findings.push({ id: `partialDependency:${table.id}:${column.id}`, rule: 'partialDependency', severity: 'info', tableId: table.id, params: { table: table.name, column: column.name, ref: ref.name } });
        }
      }
    }

    if (table.columns.length > WIDE_TABLE) {
      findings.push({ id: `wideTable:${table.id}`, rule: 'wideTable', severity: 'info', tableId: table.id, params: { table: table.name, count: table.columns.length } });
    }
  }

  // Groups of two or more columns that appear together in several tables (address, city, country).
  const signature = (column: Column) => `${column.name.toLowerCase()}:${findType(DIALECTS[project.dialect], column.type)?.generic ?? column.type}`;
  const shared = new Map<string, { columns: string[]; tableIds: string[] }>();
  const entities = schema.tables.filter((t) => t.kind === 'entity');
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const a = attributeColumns(entities[i]).filter((c) => !COMMON.has(c.name.toLowerCase()));
      const bSigs = new Set(attributeColumns(entities[j]).map(signature));
      const common = a.filter((c) => bSigs.has(signature(c))).map((c) => c.name).sort();
      if (common.length < 2) continue;
      const key = common.join(',').toLowerCase();
      const entry = shared.get(key) ?? { columns: common, tableIds: [] };
      for (const id of [entities[i].id, entities[j].id]) if (!entry.tableIds.includes(id)) entry.tableIds.push(id);
      shared.set(key, entry);
    }
  }
  for (const [key, { columns, tableIds }] of shared) {
    findings.push({
      id: `repeatedColumns:${key}:${[...tableIds].sort().join(',')}`,
      rule: 'repeatedColumns',
      severity: 'info',
      tableId: tableIds[0],
      params: { columns: columns.join(', '), tables: tableIds.map((id) => tables.get(id)?.name ?? '?').join(', ') },
    });
  }
  findings.push(...reviewSpecializations(project, schema));
  return findings;
};

/** Columns of a single table hierarchy from which the review suggests a table per subclass. */
const SPARSE_COLUMNS = 6;

/** Findings about superclasses and subclasses, and 1:1 relationships that look like one. */
const reviewSpecializations = (project: Project, schema: Schema): Finding[] => {
  const findings: Finding[] = [];
  const name = (id: string) => project.entities.find((e) => e.id === id)?.name ?? '?';
  const subtypeOf = new Set((project.specializations ?? []).flatMap((s) => s.subtypeIds));
  for (const spec of project.specializations ?? []) {
    const supertype = project.entities.find((e) => e.id === spec.supertypeId);
    if (!supertype) continue;
    const inherited = new Set(supertype.attributes.map((a) => a.name.toLowerCase()));
    const own = (id: string) => (project.entities.find((e) => e.id === id)?.attributes ?? []).filter((a) => !a.pk && !inherited.has(a.name.toLowerCase()));
    const related = (id: string) => project.relationships.some((r) => r.participants.some((p) => p.entityId === id));
    for (const subId of spec.subtypeIds) {
      if (own(subId).length || related(subId)) continue;
      findings.push({
        id: `specEmptySubtype:${spec.id}:${subId}`,
        rule: 'specEmptySubtype',
        severity: 'info',
        tableId: spec.mapping === 'single-table' ? spec.supertypeId : subId,
        params: { table: name(subId), supertype: supertype.name },
        ...(spec.mapping !== 'single-table' ? { fix: { kind: 'specMapping', specId: spec.id, mapping: 'single-table' } as const } : {}),
      });
    }
    const moved = spec.subtypeIds.reduce((sum, id) => sum + own(id).length, 0);
    if (spec.mapping === 'single-table' && moved >= SPARSE_COLUMNS) {
      findings.push({
        id: `specSparseSingleTable:${spec.id}`,
        rule: 'specSparseSingleTable',
        severity: 'info',
        tableId: spec.supertypeId,
        params: { table: supertype.name, count: moved },
        fix: { kind: 'specMapping', specId: spec.id, mapping: 'table-per-type' },
      });
    }
    if (spec.mapping === 'table-per-concrete' && project.relationships.some((r) => r.participants.some((p) => p.entityId === spec.supertypeId))) {
      findings.push({
        id: `specConcreteReferenced:${spec.id}`,
        rule: 'specConcreteReferenced',
        severity: 'warning',
        tableId: spec.supertypeId,
        params: { table: supertype.name },
        fix: { kind: 'specMapping', specId: spec.id, mapping: 'table-per-type' },
      });
    }
  }
  // A 1:1 identifying relationship whose holder has no key of its own: a subclass written by hand.
  for (const rel of project.relationships) {
    if (rel.participants.length !== 2 || rel.junctionId || !rel.identifying || rel.participants[0].cardinality !== '1') continue;
    const [parent, child] = rel.participants;
    const holder = project.entities.find((e) => e.id === child.entityId);
    if (!holder || holder.id === parent.entityId || subtypeOf.has(holder.id) || holder.attributes.some((a) => a.pk)) continue;
    if (!schema.tables.some((t) => t.id === holder.id)) continue;
    findings.push({
      id: `specFromOneToOne:${rel.id}`,
      rule: 'specFromOneToOne',
      severity: 'info',
      tableId: holder.id,
      params: { table: holder.name, supertype: name(parent.entityId) },
      fix: { kind: 'specFromRelationship', relationshipId: rel.id },
    });
  }
  return findings;
};
