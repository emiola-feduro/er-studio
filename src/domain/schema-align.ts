import type { Schema } from './types';

const lower = (text: string) => text.toLowerCase();

/** Fields that hold the id of a table, column, FK or index somewhere in a schema. */
const ID_FIELDS = new Set(['id', 'tableId', 'refTableId', 'columnId', 'fkId']);
const ID_LISTS = new Set(['columnIds', 'refColumnIds']);

const remap = (value: unknown, ids: Map<string, string>): unknown => {
  if (Array.isArray(value)) return value.map((item) => remap(item, ids));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      if (ID_FIELDS.has(key) && typeof field === 'string') return [key, ids.get(field) ?? field];
      if (ID_LISTS.has(key) && Array.isArray(field)) return [key, field.map((id) => (typeof id === 'string' ? (ids.get(id) ?? id) : id))];
      return [key, remap(field, ids)];
    }),
  );
};

/**
 * Gives the tables, columns, foreign keys and indexes of a schema read from a live database the ids of
 * the model's ones with the same names, so the migration diff (which compares by id) sees a column that
 * exists in both as the same column, and only the real differences as changes.
 */
export const alignByName = (live: Schema, model: Schema): Schema => {
  const ids = new Map<string, string>();
  for (const table of live.tables) {
    const twin = model.tables.find((t) => lower(t.name) === lower(table.name));
    if (!twin) continue;
    ids.set(table.id, twin.id);
    for (const column of table.columns) {
      const other = twin.columns.find((c) => lower(c.name) === lower(column.name));
      if (other) ids.set(column.id, other.id);
    }
    const columnNames = (t: typeof table, columnIds: string[]) => columnIds.map((id) => lower(t.columns.find((c) => c.id === id)?.name ?? '')).join(',');
    const refName = (s: Schema, id: string) => lower(s.tables.find((t) => t.id === id)?.name ?? '');
    for (const fk of table.foreignKeys) {
      const other =
        twin.foreignKeys.find((f) => lower(f.name) === lower(fk.name)) ??
        twin.foreignKeys.find(
          (f) => columnNames(twin, f.columnIds) === columnNames(table, fk.columnIds) && refName(model, f.refTableId) === refName(live, fk.refTableId),
        );
      if (other) ids.set(fk.id, other.id);
    }
    for (const index of table.indexes) {
      const other =
        twin.indexes.find((i) => lower(i.name) === lower(index.name)) ??
        twin.indexes.find(
          (i) =>
            columnNames(
              twin,
              i.columns.map((c) => c.columnId),
            ) ===
            columnNames(
              table,
              index.columns.map((c) => c.columnId),
            ),
        );
      if (other) ids.set(index.id, other.id);
    }
  }
  return remap(live, ids) as Schema;
};
