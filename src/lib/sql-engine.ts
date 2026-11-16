import type { Database, SqlJsStatic } from 'sql.js';
import type { QueryData, SqlValue } from '../domain/query-data';

export type QueryRun = { columns: string[]; rows: SqlValue[][]; ms: number } | { error: string };

let engine: Promise<SqlJsStatic> | undefined;

/** sql.js and its WebAssembly file, downloaded the first time a query runs. */
export const loadSqlEngine = () => {
  engine ??= Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(([module, wasm]) =>
    module.default({ locateFile: () => wasm.default }),
  );
  engine.catch(() => (engine = undefined));
  return engine;
};

const fill = (db: Database, data: QueryData) => {
  db.run('PRAGMA foreign_keys = OFF;');
  db.create_function('regexp', (pattern: string, value: unknown) => {
    if (value === null || value === undefined) return null;
    try {
      return new RegExp(pattern).test(String(value)) ? 1 : 0;
    } catch {
      return 0;
    }
  });
  for (const statement of data.createStatements) db.run(statement);
  for (const insert of data.inserts) {
    const prepared = db.prepare(insert.sql);
    try {
      for (const row of insert.rows) prepared.run(row);
    } finally {
      prepared.free();
    }
  }
};

/**
 * Runs one query on a new in-memory database filled with the records. The database is thrown away
 * afterwards, so nothing the query does reaches the project.
 */
export const runOnRecords = (SQL: SqlJsStatic, data: QueryData, sql: string): QueryRun => {
  const db = new SQL.Database();
  try {
    fill(db, data);
    const started = performance.now();
    const results = db.exec(sql);
    const ms = performance.now() - started;
    const last = results[results.length - 1];
    return { columns: last?.columns ?? [], rows: (last?.values ?? []) as SqlValue[][], ms };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    db.close();
  }
};
