import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSchema } from '../inference';
import { validateRecords } from '../records';
import { importIr } from '.';
import { copySqliteRows, isSqliteFile, sqliteToIr, type SqliteExec } from './sqlite';

const STORE = `
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre VARCHAR(80) NOT NULL,
  email TEXT UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE productos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
  foto BLOB
);
CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL
);
CREATE TABLE pedido_producto (
  pedido_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  PRIMARY KEY (pedido_id, producto_id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);
CREATE INDEX idx_pedidos_fecha ON pedidos (fecha DESC);
CREATE VIEW v_clientes AS SELECT nombre FROM clientes;
CREATE TRIGGER t_pedidos AFTER INSERT ON pedidos BEGIN SELECT 1; END;
INSERT INTO clientes (nombre, email) VALUES ('Ana', 'ana@x.com'), ('Luis', NULL), ('Eva', 'eva@x.com');
INSERT INTO productos VALUES (1, 'Lápiz', 1.5, X'CAFE'), (2, 'Cuaderno', 3, NULL);
INSERT INTO pedidos VALUES (1, 1, '2026-01-10'), (2, 3, '2026-02-01');
INSERT INTO pedido_producto VALUES (1, 1), (1, 2), (2, 2);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const open = (script: string): { db: Database; exec: SqliteExec } => {
  const db = new SQL.Database();
  db.run(script);
  return { db, exec: (sql) => db.exec(sql) };
};

describe('sqliteToIr', () => {
  it('recognizes the file header', () => {
    const { db } = open(STORE);
    expect(isSqliteFile(db.export())).toBe(true);
    expect(isSqliteFile(new TextEncoder().encode('CREATE TABLE x (id INT);'))).toBe(false);
  });

  it('reads tables, keys, indexes and a junction, and lists views and triggers as skipped', () => {
    const { exec } = open(STORE);
    const { ir } = sqliteToIr(exec);
    expect(ir.tables.map((t) => t.name)).toEqual(['clientes', 'productos', 'pedidos', 'pedido_producto']);
    expect(ir.skipped).toEqual(expect.arrayContaining(['VIEW v_clientes', 'TRIGGER t_pedidos']));

    const { project, report } = importIr(ir, 'sqlite', { name: 'tienda', namesLocale: 'es' });
    expect(project.dialect).toBe('sqlite');
    expect(report.tables).toBe(4);
    const schema = buildSchema(project);
    const pedidos = schema.tables.find((t) => t.name === 'pedidos')!;
    expect(pedidos.foreignKeys).toHaveLength(1);
    expect(pedidos.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(pedidos.indexes.map((i) => i.name)).toContain('idx_pedidos_fecha');
    // The junction becomes a many-to-many relationship and its table comes back with both FKs.
    expect(project.relationships.some((r) => r.participants.length === 2 && r.participants.every((p) => p.cardinality === 'N'))).toBe(true);
    expect(schema.tables.find((t) => t.name === 'pedido_producto')?.foreignKeys).toHaveLength(2);
  });

  it('rebuilds from the PRAGMAs a table whose DDL the reader does not follow', () => {
    const { exec } = open(`
      CREATE TABLE medidas (
        id INTEGER PRIMARY KEY,
        valor REAL NOT NULL,
        doble REAL GENERATED ALWAYS AS (valor * 2) VIRTUAL,
        nota ANY
      ) STRICT;
    `);
    const { ir } = sqliteToIr(exec);
    const table = ir.tables[0];
    expect(table.columns.map((c) => c.name)).toEqual(['id', 'valor', 'doble', 'nota']);
    expect(table.columns.find((c) => c.name === 'valor')?.notNull).toBe(true);
  });
});

describe('copySqliteRows', () => {
  it('keeps only the child rows whose parent was copied', () => {
    const { exec } = open(`
      CREATE TABLE autores (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
      CREATE TABLE libros (id INTEGER PRIMARY KEY, autor_id INTEGER REFERENCES autores(id), titulo TEXT NOT NULL);
    `);
    for (let i = 1; i <= 10; i++) exec(`INSERT INTO autores VALUES (${i}, 'A${i}')`);
    for (let i = 1; i <= 10; i++) exec(`INSERT INTO libros VALUES (${i}, ${i % 2 === 0 ? 11 - i : 'NULL'}, 'L${i}')`);
    const { project } = importIr(sqliteToIr(exec).ir, 'sqlite', { name: 'b', namesLocale: 'es' });
    copySqliteRows(exec, project, 3);
    const schema = buildSchema(project);
    const libros = schema.tables.find((t) => t.name === 'libros')!;
    // Authors 1 to 3 come in; books 1, 3 and 5 have no author, book 8 points to author 3.
    expect(project.records![libros.id].map((r) => r.values[libros.columns.find((c) => c.name === 'titulo')!.id])).toEqual(['L1', 'L3', 'L5']);
    expect(validateRecords(project, schema).total).toBe(0);
  });

  it('copies rows into the records with the limit, and they pass validation', () => {
    const { exec } = open(STORE);
    const { project } = importIr(sqliteToIr(exec).ir, 'sqlite', { name: 'tienda', namesLocale: 'es' });
    const report = copySqliteRows(exec, project, 2);
    const schema = buildSchema(project);
    const clientes = schema.tables.find((t) => t.name === 'clientes')!;
    const rows = project.records![clientes.id];
    expect(rows).toHaveLength(2);
    expect(report.truncated).toContain('clientes');
    const email = clientes.columns.find((c) => c.name === 'email')!;
    expect(rows[1].values[email.id] ?? '').toBe('');

    const full = importIr(sqliteToIr(exec).ir, 'sqlite', { name: 'tienda', namesLocale: 'es' }).project;
    expect(copySqliteRows(exec, full, 1000)).toMatchObject({ tables: 4, rows: 10, truncated: [] });
    const productos = buildSchema(full).tables.find((t) => t.name === 'productos')!;
    const foto = productos.columns.find((c) => c.name === 'foto')!;
    expect(full.records![productos.id][0].values[foto.id]).toBe('0xcafe');
    expect([...validateRecords(full, buildSchema(full)).cells.values()].flatMap((r) => [...r.values()].flatMap((c) => [...c.values()]))).toEqual([]);
  });
});
