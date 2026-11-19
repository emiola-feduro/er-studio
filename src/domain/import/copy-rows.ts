import { buildSchema } from '../inference';
import { uid } from '../model';
import { generationOrder } from '../records';
import type { Column, DataRow, Project } from '../types';

/** One page of rows from a source table: column names and the values of each row. */
export type RowPage = { columns: string[]; values: unknown[][] };

/**
 * Where rows come from: a SQLite file in memory, or a live connection. `fetch` returns the rows of the
 * source table that became `tableName` in the project, from `offset` on.
 */
export type RowSource = {
  has: (tableName: string) => boolean;
  fetch: (tableName: string, offset: number, limit: number) => Promise<RowPage> | RowPage;
  /** Text the records keep for a value read from the source. */
  cell: (value: unknown, column: Column) => string;
};

export type CopyReport = { tables: number; rows: number; truncated: string[] };

const CHUNK = 5000;
const lower = (text: string) => text.toLowerCase();

/**
 * Copies up to `limit` rows of each source table into the records of the imported project, matching
 * columns by name. Parents go first, and when a parent table was cut by the limit only the child rows
 * that point to a copied parent row come along, so the records keep their references.
 */
export const copyRows = async (source: RowSource, project: Project, limit: number, onTable?: (name: string) => void): Promise<CopyReport> => {
  const schema = buildSchema(project);
  const records: Record<string, DataRow[]> = {};
  const report: CopyReport = { tables: 0, rows: 0, truncated: [] };
  const cut = new Set<string>();
  // Per copied table and column ids, the key values present, to check the references of the tables after it.
  const keys = new Map<string, Set<string>>();
  const keySet = (tableId: string, columnIds: string[]) => {
    const key = `${tableId}:${columnIds.join('|')}`;
    let set = keys.get(key);
    if (!set) keys.set(key, (set = new Set((records[tableId] ?? []).map((r) => columnIds.map((id) => r.values[id] ?? '').join('\u0000')))));
    return set;
  };

  for (const table of generationOrder(schema.tables)) {
    if (!source.has(table.name)) continue;
    onTable?.(table.name);
    const checks = table.foreignKeys.filter((fk) => fk.refTableId !== table.id && cut.has(fk.refTableId));
    const kept: DataRow[] = [];
    let more = false;
    for (let offset = 0; ; offset += CHUNK) {
      const page = await source.fetch(table.name, offset, CHUNK);
      if (page.values.length === 0) break;
      const columns = page.columns.map((name) => table.columns.find((c) => lower(c.name) === lower(name)));
      for (const row of page.values) {
        const values: Record<string, string> = {};
        row.forEach((value, i) => {
          const column = columns[i];
          if (column && value !== null && value !== undefined) values[column.id] = source.cell(value, column);
        });
        const fits = checks.every((fk) => {
          if (fk.columnIds.some((id) => !values[id])) return true;
          return keySet(fk.refTableId, fk.refColumnIds).has(fk.columnIds.map((id) => values[id]).join('\u0000'));
        });
        if (!fits) {
          more = true;
          continue;
        }
        if (kept.length === limit) {
          more = true;
          break;
        }
        kept.push({ id: uid(), values });
      }
      if (kept.length === limit && more) break;
      if (page.values.length < CHUNK) break;
    }
    records[table.id] = kept;
    if (more) {
      cut.add(table.id);
      report.truncated.push(table.name);
    }
    report.tables += 1;
    report.rows += kept.length;
  }
  project.records = records;
  return report;
};

/** PostgreSQL prints booleans as t/f and bytea as \x...; the records use true/false and 0x.... */
export const postgresCell = (value: unknown, column: Column): string => {
  const text = String(value);
  if (column.type.toUpperCase() === 'BOOLEAN') return text === 't' ? 'true' : text === 'f' ? 'false' : text;
  if (column.type.toUpperCase() === 'BYTEA' && text.startsWith('\\x')) return `0x${text.slice(2)}`;
  return text;
};
