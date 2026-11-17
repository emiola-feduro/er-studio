import { t } from '../i18n';
import { discriminatorAttrId, discriminatorOf, flagAttrId, specializationProblems, specializationRelId } from './specialization';
import type { DataRow, ForeignKey, Project, Schema, Specialization, Table } from './types';

/**
 * The rules of a specialization on the records: what the tables cannot say by themselves (a row in
 * two subclasses of a disjoint hierarchy, a superclass row with no subclass in a total one, a value
 * in a column of a subclass the row does not belong to), and how random rows follow them.
 */

type Hierarchy = {
  spec: Specialization;
  supertype: Table;
  /** Subtype id -> its table (table per type only). */
  subtables: Map<string, Table>;
  /** Discriminator value per subtype id. */
  values: Record<string, string>;
  discriminatorId?: string;
  /** Flag column per subtype id (single table, overlapping). */
  flags: Map<string, string>;
  /** Subtype id -> columns of the subtype stored in the supertype's table (single table). */
  ownColumns: Map<string, { id: string; required: boolean }[]>;
};

const TRUE = new Set(['true', '1']);
const isOn = (raw: string | undefined) => TRUE.has((raw ?? '').trim().toLowerCase());
const blank = (row: DataRow, id: string) => !(row.values[id] ?? '').trim();

const hierarchies = (project: Project, schema: Schema): Hierarchy[] => {
  const broken = new Set(specializationProblems(project).filter((p) => p.level === 'error').map((p) => p.specializationId));
  const tables = new Map(schema.tables.map((x) => [x.id, x]));
  const result: Hierarchy[] = [];
  for (const spec of project.specializations ?? []) {
    if (broken.has(spec.id) || spec.mapping === 'table-per-concrete') continue;
    const supertype = tables.get(spec.supertypeId);
    if (!supertype) continue;
    const { values } = discriminatorOf(spec, project.entities, project.namesLocale);
    const has = (id: string) => supertype.columns.some((c) => c.id === id);
    const subtables = new Map<string, Table>();
    const flags = new Map<string, string>();
    const ownColumns = new Map<string, { id: string; required: boolean }[]>();
    for (const subId of spec.subtypeIds) {
      if (spec.mapping === 'table-per-type') {
        const table = tables.get(subId);
        if (table) subtables.set(subId, table);
        continue;
      }
      if (has(flagAttrId(spec.id, subId))) flags.set(subId, flagAttrId(spec.id, subId));
      const entity = project.entities.find((e) => e.id === subId);
      ownColumns.set(
        subId,
        (entity?.attributes ?? []).filter((a) => has(a.id) && !a.pk).map((a) => ({ id: a.id, required: !a.nullable })),
      );
    }
    result.push({ spec, supertype, subtables, values, discriminatorId: has(discriminatorAttrId(spec.id)) ? discriminatorAttrId(spec.id) : undefined, flags, ownColumns });
  }
  return result;
};

/** Key of a supertype row and of the subtype row that points to it (the subtype key is the FK). */
const superKey = (table: Table, row: DataRow) => (table.pk?.columnIds ?? []).map((id) => row.values[id] ?? '').join('\u0000');
const subKey = (sub: Table, row: DataRow, specId: string, subId: string) => {
  const fk = sub.foreignKeys.find((f) => f.relationshipId === specializationRelId(specId, subId));
  return fk ? fk.columnIds.map((id) => row.values[id] ?? '').join('\u0000') : '';
};

export const validateSpecializationRecords = (
  project: Project,
  schema: Schema,
  add: (table: Table, rowId: string, columnId: string, message: string) => void,
) => {
  const records = project.records ?? {};
  const name = (id: string) => project.entities.find((e) => e.id === id)?.name ?? id;
  for (const h of hierarchies(project, schema)) {
    const { spec, supertype } = h;
    const superRows = records[supertype.id] ?? [];
    const firstKey = supertype.pk?.columnIds[0];

    if (spec.mapping === 'table-per-type') {
      const bySuperKey = new Map(superRows.map((r) => [superKey(supertype, r), r]));
      const owners = new Map<string, string>(); // supertype key -> first subtype holding it
      for (const [subId, sub] of h.subtables) {
        const fkColumn = sub.foreignKeys.find((f) => f.relationshipId === specializationRelId(spec.id, subId))?.columnIds[0];
        if (!fkColumn) continue;
        for (const row of records[sub.id] ?? []) {
          const key = subKey(sub, row, spec.id, subId);
          if (!key.replace(/\u0000/g, '')) continue;
          const owner = owners.get(key);
          if (spec.disjoint && owner && owner !== subId) {
            add(sub, row.id, fkColumn, t('value.specDisjoint', { other: name(owner), supertype: name(spec.supertypeId) }));
          } else if (!owner) owners.set(key, subId);
          const parent = bySuperKey.get(key);
          const said = h.discriminatorId ? parent?.values[h.discriminatorId]?.trim() : undefined;
          if (said && said !== h.values[subId]) {
            add(sub, row.id, fkColumn, t('value.specDiscriminator', { value: said, expected: h.values[subId], supertype: name(spec.supertypeId) }));
          }
        }
      }
      if (spec.total && firstKey) {
        for (const row of superRows) {
          if (!owners.has(superKey(supertype, row))) add(supertype, row.id, firstKey, t('value.specTotal', { subtypes: spec.subtypeIds.map(name).join(', ') }));
        }
      }
      continue;
    }

    // Single table: subtype columns only for rows of that subtype, its required ones filled.
    for (const row of superRows) {
      const said = h.discriminatorId ? row.values[h.discriminatorId]?.trim() : undefined;
      const belongs = (subId: string) => (h.discriminatorId ? said === h.values[subId] : isOn(row.values[h.flags.get(subId) ?? '']));
      for (const [subId, columns] of h.ownColumns) {
        const isSub = belongs(subId);
        for (const column of columns) {
          if (!isSub && !blank(row, column.id)) add(supertype, row.id, column.id, t('value.specNotSubtype', { subtype: name(subId) }));
          if (isSub && column.required && blank(row, column.id)) add(supertype, row.id, column.id, t('value.required'));
        }
      }
      if (spec.total && !spec.disjoint && h.flags.size && ![...h.flags.keys()].some(belongs)) {
        add(supertype, row.id, [...h.flags.values()][0], t('value.specTotal', { subtypes: spec.subtypeIds.map(name).join(', ') }));
      }
    }
  }
};

/* Random rows */

type Rng = () => number;
const pickOne = <T,>(rng: Rng, list: readonly T[]) => list[Math.floor(rng() * list.length) % list.length];

/**
 * Which supertype rows a new subtype row may point to: in a disjoint hierarchy, rows no other
 * subtype has and whose discriminator names this subtype.
 */
export const specializationRefFilter = (project: Project, schema: Schema, table: Table) => {
  const records = project.records ?? {};
  for (const h of hierarchies(project, schema)) {
    if (h.spec.mapping !== 'table-per-type' || !h.subtables.has(table.id)) continue;
    const { spec, supertype } = h;
    const subId = table.id;
    const taken = new Set<string>();
    if (spec.disjoint) {
      for (const [otherId, other] of h.subtables) {
        if (otherId === subId) continue;
        for (const row of records[other.id] ?? []) taken.add(subKey(other, row, spec.id, otherId));
      }
    }
    const fkId = table.foreignKeys.find((f) => f.relationshipId === specializationRelId(spec.id, subId))?.id;
    return (fk: ForeignKey, refRow: DataRow) => {
      if (fk.id !== fkId) return true;
      if (taken.has(superKey(supertype, refRow))) return false;
      // With a discriminator, only rows that say this subtype; rows that say nothing have no subtype.
      return h.discriminatorId ? refRow.values[h.discriminatorId]?.trim() === h.values[subId] : true;
    };
  }
  return undefined;
};

/**
 * Makes a new supertype row say its subtype: the discriminator or the flags, and in a single table
 * only the chosen subtype's columns filled (the required ones always).
 */
export const shapeSupertypeRow = (
  project: Project,
  schema: Schema,
  table: Table,
  values: Record<string, string>,
  rng: Rng,
  fill: (columnId: string) => string | null,
) => {
  for (const h of hierarchies(project, schema)) {
    if (h.supertype.id !== table.id) continue;
    const { spec } = h;
    const subIds = spec.subtypeIds;
    let chosen: string[] = [];
    if (spec.disjoint) {
      // A partial hierarchy leaves about one row in five without a subtype.
      const none = !spec.total && rng() < 0.2;
      chosen = none ? [] : [pickOne(rng, subIds)];
      if (h.discriminatorId) {
        if (chosen.length) values[h.discriminatorId] = h.values[chosen[0]];
        else delete values[h.discriminatorId];
      }
    } else {
      chosen = subIds.filter(() => rng() < 0.5);
      if (spec.total && chosen.length === 0) chosen = [pickOne(rng, subIds)];
      for (const [subId, flag] of h.flags) values[flag] = chosen.includes(subId) ? (project.dialect === 'sqlserver' || project.dialect === 'oracle' ? '1' : 'true') : project.dialect === 'sqlserver' || project.dialect === 'oracle' ? '0' : 'false';
    }
    for (const [subId, columns] of h.ownColumns) {
      for (const column of columns) {
        if (!chosen.includes(subId)) delete values[column.id];
        else if (!values[column.id]) {
          const value = fill(column.id);
          if (value !== null) values[column.id] = value;
        }
      }
    }
  }
};
