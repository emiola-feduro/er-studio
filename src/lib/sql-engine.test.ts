import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSchema } from '../domain/inference';
import { changeDialect } from '../domain/model';
import { generatedQueryForSqlite, prepareQueryData } from '../domain/query-data';
import { createRandomProject } from './random-project';
import { createSampleProject } from './sample-project';
import { runOnRecords, type QueryRun } from './sql-engine';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const ok = (run: QueryRun) => {
  if ('error' in run) throw new Error(run.error);
  return run;
};

describe('queries on the records', () => {
  const project = createSampleProject();
  const schema = buildSchema(project);
  const id = (name: string) => schema.tables.find((t) => t.name === name)!.id;

  it('runs the generated query with its joins', () => {
    const data = prepareQueryData(project);
    const sql = generatedQueryForSqlite(data, project, { tableIds: [id('cliente'), id('producto')], where: "cl.nombre ILIKE '%ana%'", limit: 0 });
    const run = ok(runOnRecords(SQL, data, sql));
    expect(run.columns).toContain('producto_nombre');
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0]).toContain('Teclado');
    expect(data.rowCounts[id('cliente')]).toBe(2);
  });

  it('stores numbers as numbers and empty cells as NULL', () => {
    const run = ok(runOnRecords(SQL, prepareQueryData(project), 'SELECT SUM(precio), COUNT(*) FROM producto WHERE precio > 20'));
    expect(run.rows).toEqual([[45.9, 1]]);
  });

  it('translates SQL Server TOP when the project is in SQL Server', () => {
    const copy = structuredClone(project);
    changeDialect(copy, 'sqlserver');
    copy.dialect = 'sqlserver';
    const data = prepareQueryData(copy);
    const run = ok(runOnRecords(SQL, data, generatedQueryForSqlite(data, copy, { tableIds: [id('cliente')], limit: 1 })));
    expect(run.rows).toHaveLength(1);
  });

  it('loads rows with invalid values and supports REGEXP', () => {
    const copy = structuredClone(project);
    const cliente = schema.tables.find((t) => t.name === 'cliente')!;
    copy.records![cliente.id][0].values[cliente.columns[0].id] = 'not a number';
    const run = ok(runOnRecords(SQL, prepareQueryData(copy), "SELECT nombre FROM cliente WHERE email REGEXP '^luis@'"));
    expect(run.rows).toEqual([['Luis Gómez']]);
  });

  it('reports SQL errors and never changes the project', () => {
    const data = prepareQueryData(project);
    expect(runOnRecords(SQL, data, 'SELECT nada FROM cliente')).toHaveProperty('error');
    runOnRecords(SQL, data, 'DELETE FROM cliente');
    expect(ok(runOnRecords(SQL, data, 'SELECT COUNT(*) FROM cliente')).rows).toEqual([[2]]);
  });

  it('runs on a random project in every gestor', () => {
    for (const dialect of ['postgresql', 'mysql', 'sqlserver', 'oracle', 'sqlite'] as const) {
      const random = createRandomProject({ name: 'r', dialect, entityCount: 5, themeId: 'store', recordCount: 10, namesLocale: 'es' });
      const data = prepareQueryData(random);
      const tables = buildSchema(random).tables;
      const sql = generatedQueryForSqlite(data, random, { tableIds: tables.slice(0, 3).map((t) => t.id), limit: 0 });
      const run = ok(runOnRecords(SQL, data, sql));
      expect(run.columns.length).toBeGreaterThan(0);
    }
  });
});
