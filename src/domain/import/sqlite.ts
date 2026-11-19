import { buildSchema } from '../inference';
import { uid } from '../model';
import { generationOrder } from '../records';
import type { DataRow, Project } from '../types';
import { emptyColumn, emptyTable, type Ir, type IrTable } from './ir';
import { parseSql } from './sql-parser';

/** One result set, as sql.js returns it from Database.exec. */
export type SqliteResult = { columns: string[]; values: unknown[][] };

/** Runs a statement on the open file. Kept as a function so this module never imports sql.js. */
export type SqliteExec = (sql: string) => SqliteResult[];

/** First 16 bytes of every SQLite 3 database file. */
const MAGIC = 'SQLite format 3\u0000';

export const isSqliteFile = (bytes: Uint8Array) => bytes.length >= 16 && String.fromCharCode(...bytes.subarray(0, 16)) === MAGIC;

const rows = (exec: SqliteExec, sql: string): Record<string, unknown>[] => {
  const [result] = exec(sql);
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, i) => [column, values[i]])));
};

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;
const quoteText = (text: string) => `'${text.replace(/'/g, "''")}'`;
const lower = (text: string) => text.toLowerCase();

/** "VARCHAR(255)" → VARCHAR with ['255']; "" (no declared type) → BLOB, which is what SQLite gives such a column. */
const splitType = (declared: string) => {
  const match = /^([^(]*?)\s*(?:\(([^)]*)\))?\s*$/.exec(declared.trim());
  const type = (match?.[1] ?? declared).trim().toUpperCase() || 'BLOB';
  const params = match?.[2] ? match[2].split(',').map((p) => p.trim()) : [];
  return { type, params };
};

/** A table read only from the PRAGMAs, for DDL the reader could not follow. */
const tableFromPragmas = (exec: SqliteExec, name: string): IrTable => {
  const table = emptyTable(name);
  const info = rows(exec, `PRAGMA table_xinfo(${quoteText(name)})`).filter((c) => Number(c.hidden ?? 0) !== 1);
  const pk = info.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk));
  for (const c of info) {
    const { type, params } = splitType(String(c.type ?? ''));
    const column = emptyColumn(String(c.name), type, params);
    column.notNull = Number(c.notnull) === 1;
    if (c.dflt_value !== null && c.dflt_value !== undefined) column.defaultValue = String(c.dflt_value);
    if (pk.length === 1 && pk[0].name === c.name) column.pk = true;
    table.columns.push(column);
  }
  if (pk.length > 1) table.pk = { columns: pk.map((c) => String(c.name)) };

  const fks = new Map<number, IrTable['foreignKeys'][number]>();
  for (const f of rows(exec, `PRAGMA foreign_key_list(${quoteText(name)})`)) {
    const id = Number(f.id);
    const fk = fks.get(id) ?? { columns: [], refTable: String(f.table), refColumns: [], onDelete: String(f.on_delete), onUpdate: String(f.on_update) };
    fk.columns.push(String(f.from));
    if (f.to !== null && f.to !== undefined) fk.refColumns.push(String(f.to));
    fks.set(id, fk);
  }
  table.foreignKeys = [...fks.values()];

  for (const index of rows(exec, `PRAGMA index_list(${quoteText(name)})`)) {
    const columns = rows(exec, `PRAGMA index_info(${quoteText(String(index.name))})`)
      .sort((a, b) => Number(a.seqno) - Number(b.seqno))
      .map((c) => String(c.name));
    // Indexes SQLite makes on its own back a UNIQUE or PRIMARY KEY written in the table.
    if (index.origin === 'u') table.uniques.push({ columns });
    else if (index.origin === 'c')
      table.indexes.push({ name: String(index.name), unique: Number(index.unique) === 1, columns: columns.map((c) => ({ name: c, order: 'ASC' })) });
  }
  return table;
};

const sameColumns = (parsed: IrTable, exec: SqliteExec) => {
  const names = rows(exec, `PRAGMA table_xinfo(${quoteText(parsed.name)})`)
    .filter((c) => Number(c.hidden ?? 0) !== 1)
    .map((c) => lower(String(c.name)));
  const mine = parsed.columns.map((c) => lower(c.name));
  return names.length === mine.length && names.every((n) => mine.includes(n));
};

export type SqliteSchema = { ir: Ir; tables: string[] };

/**
 * Reads the schema of an open SQLite file. SQLite keeps each CREATE statement as written, so they go
 * through the same reader as a pasted DDL; a table the reader cannot follow is rebuilt from the PRAGMAs.
 */
export const sqliteToIr = (exec: SqliteExec): SqliteSchema => {
  const objects = rows(exec, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY rowid");
  const tables = objects.filter((o) => o.type === 'table' && typeof o.sql === 'string' && !/^\s*CREATE\s+VIRTUAL\b/i.test(String(o.sql)));
  const skipped = objects
    .filter((o) => !tables.includes(o) && o.sql && !(o.type === 'index' && tables.some((t) => t.name === o.tbl_name)))
    .map((o) => `${String(o.type).toUpperCase()} ${o.name}`);
  const ddl = objects
    .filter((o) => (tables.includes(o) || (o.type === 'index' && tables.some((t) => t.name === o.tbl_name))) && o.sql)
    .map((o) => `${o.sql};`)
    .join('\n');

  const parsed = parseSql(ddl);
  const byName = new Map(parsed.tables.map((t) => [lower(t.name), t]));
  const ir: Ir = { ...parsed, dialect: 'sqlite', skipped: [...skipped, ...parsed.skipped] };
  ir.tables = tables.map((o) => {
    const name = String(o.name);
    const table = byName.get(lower(name));
    return table && sameColumns(table, exec) ? table : tableFromPragmas(exec, name);
  });
  return { ir, tables: ir.tables.map((t) => t.name) };
};

/** Text the records grid shows for a value read from SQLite. */
const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Uint8Array) return `0x${Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  return String(value);
};

export type CopyReport = { tables: number; rows: number; truncated: string[] };

const CHUNK = 5000;

/**
 * Copies up to `limit` rows of each source table into the records of the imported project, matching
 * tables and columns by name. Parents go first, and when a parent table was cut by the limit only the
 * child rows that point to a copied parent row come along, so the records keep their references.
 */
export const copySqliteRows = (exec: SqliteExec, project: Project, limit: number): CopyReport => {
  const schema = buildSchema(project);
  const records: Record<string, DataRow[]> = {};
  const report: CopyReport = { tables: 0, rows: 0, truncated: [] };
  const sourceNames = new Map(
    rows(exec, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => [lower(String(r.name)), String(r.name)]),
  );
  const cut = new Set<string>();
  // Per copied table and column id, the values present, to check the references of the tables after it.
  const keys = new Map<string, Map<string, Set<string>>>();
  const keySet = (tableId: string, columnIds: string[]) => {
    const rowsOf = records[tableId] ?? [];
    const key = columnIds.join('|');
    let byColumns = keys.get(tableId);
    if (!byColumns) keys.set(tableId, (byColumns = new Map()));
    let set = byColumns.get(key);
    if (!set) byColumns.set(key, (set = new Set(rowsOf.map((r) => columnIds.map((id) => r.values[id] ?? '').join('\u0000')))));
    return set;
  };

  for (const table of generationOrder(schema.tables)) {
    const source = sourceNames.get(lower(table.name));
    if (!source) continue;
    const checks = table.foreignKeys.filter((fk) => fk.refTableId !== table.id && cut.has(fk.refTableId));
    const kept: DataRow[] = [];
    let more = false;
    for (let offset = 0; ; offset += CHUNK) {
      const [result] = exec(`SELECT * FROM ${quoteIdent(source)} LIMIT ${CHUNK} OFFSET ${offset}`);
      if (!result || result.values.length === 0) break;
      const columnIds = result.columns.map((name) => table.columns.find((c) => lower(c.name) === lower(name))?.id);
      for (const row of result.values) {
        const values: Record<string, string> = {};
        row.forEach((value, i) => {
          const id = columnIds[i];
          if (id && value !== null && value !== undefined) values[id] = cellText(value);
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
      if (result.values.length < CHUNK) break;
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
