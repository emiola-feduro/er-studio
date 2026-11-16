import { ddlType, quoteIdent } from './dialects';
import { buildSchema } from './inference';
import { changeDialect } from './model';
import { buildSelect, type QuerySpec } from './query-builder';
import { jsonValue } from './records-export';
import { toSqlite } from './sql-translate';
import type { Project, Schema } from './types';

/**
 * The project's records laid out for an in-memory SQLite database: one table per table of the
 * model, with only names and types (no keys or checks, so rows with errors load too), and the
 * values typed the way SQLite stores them.
 */

export type SqlValue = string | number | null;

export type QueryData = {
  /** The model converted to SQLite, with the same table and column ids. */
  schema: Schema;
  createStatements: string[];
  inserts: { sql: string; rows: SqlValue[][] }[];
  /** Rows per table id, to tell when the chosen tables are empty. */
  rowCounts: Record<string, number>;
};

export const prepareQueryData = (project: Project): QueryData => {
  const original = buildSchema(project);
  const copy = structuredClone(project);
  if (copy.dialect !== 'sqlite') changeDialect(copy, 'sqlite');
  copy.dialect = 'sqlite';
  const schema = buildSchema(copy);
  const records = project.records ?? {};
  const q = (name: string) => quoteIdent('sqlite', name);

  const createStatements: string[] = [];
  const inserts: QueryData['inserts'] = [];
  const rowCounts: Record<string, number> = {};
  for (const table of schema.tables) {
    // A table with no columns yet still exists, so a query naming it gets an empty result.
    const columnsSql = table.columns.length ? table.columns.map((c) => `${q(c.name)} ${ddlType('sqlite', c)}`).join(', ') : '_empty INTEGER';
    createStatements.push(`CREATE TABLE ${q(table.name)} (${columnsSql});`);
    const rows = records[table.id] ?? [];
    rowCounts[table.id] = rows.length;
    if (!rows.length || !table.columns.length) continue;
    const source = original.tables.find((t) => t.id === table.id);
    const sourceColumn = (id: string) => source?.columns.find((c) => c.id === id);
    inserts.push({
      sql: `INSERT INTO ${q(table.name)} (${table.columns.map((c) => q(c.name)).join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')});`,
      rows: rows.map((row) =>
        table.columns.map((column) => {
          const raw = row.values[column.id] ?? '';
          const typed = jsonValue(project.dialect, sourceColumn(column.id) ?? column, raw);
          return typeof typed === 'boolean' ? (typed ? 1 : 0) : typed;
        }),
      ),
    });
  }
  return { schema, createStatements, inserts, rowCounts };
};

/** The generated query written for SQLite: built again from the spec, with the WHERE translated. */
export const generatedQueryForSqlite = (data: QueryData, project: Project, spec: QuerySpec) =>
  buildSelect(data.schema, 'sqlite', { ...spec, where: spec.where ? toSqlite(spec.where, project.dialect) : spec.where }).sql;
