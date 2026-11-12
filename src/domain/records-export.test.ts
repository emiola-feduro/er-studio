import { describe, expect, it } from 'vitest';
import { generateDdl } from './ddl';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { generateInserts, jsonValue, recordsToJson, sqlLiteral, tableToCsv } from './records-export';
import type { Column, DialectId } from './types';

const column = (type: string, extra: Partial<Column> = {}): Column => ({
  id: 'c',
  name: 'campo',
  type,
  nullable: true,
  unique: false,
  autoIncrement: false,
  pk: false,
  origin: 'attribute',
  ...extra,
});

describe('database name in the DDL', () => {
  const ddlFor = (dialect: DialectId, databaseName: string) => {
    const b = makeProject(dialect);
    b.entity('cliente');
    return generateDdl(buildSchema(b.project), dialect, { databaseName });
  };

  it('creates and switches to the database with each gestor syntax', () => {
    expect(ddlFor('postgresql', 'tienda').sql).toContain('CREATE DATABASE tienda;\n\\connect tienda');
    expect(ddlFor('mysql', 'tienda').sql).toContain('CREATE DATABASE IF NOT EXISTS tienda;\nUSE tienda;');
    expect(ddlFor('sqlserver', 'tienda').sql).toContain('CREATE DATABASE tienda;\nGO\nUSE tienda;\nGO');
    expect(ddlFor('oracle', 'tienda').sql).toContain('ALTER SESSION SET CURRENT_SCHEMA = tienda;');
    const sqlite = ddlFor('sqlite', 'tienda');
    expect(sqlite.sql).toContain('-- Base de datos: tienda.db');
    expect(sqlite.warnings.some((w) => w.includes('tienda.db'))).toBe(true);
  });

  it('quotes names that need it and comes before the tables', () => {
    const { sql } = ddlFor('mysql', 'mi tienda');
    expect(sql).toContain('USE `mi tienda`;');
    expect(sql.indexOf('USE')).toBeLessThan(sql.indexOf('CREATE TABLE'));
  });

  it('adds nothing when the name is empty', () => {
    expect(ddlFor('postgresql', '  ').sql).not.toContain('DATABASE');
  });
});

describe('sqlLiteral', () => {
  it('writes each type in the gestor syntax', () => {
    expect(sqlLiteral('postgresql', column('INTEGER'), '42')).toBe('42');
    expect(sqlLiteral('postgresql', column('INTEGER'), '')).toBe('NULL');
    expect(sqlLiteral('postgresql', column('BOOLEAN'), 'true')).toBe('TRUE');
    expect(sqlLiteral('sqlserver', column('BIT'), 'true')).toBe('1');
    expect(sqlLiteral('postgresql', column('VARCHAR'), "O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral('sqlserver', column('NVARCHAR'), 'Perú')).toBe("N'Perú'");
    expect(sqlLiteral('oracle', column('DATE'), '2024-05-01')).toBe("DATE '2024-05-01'");
    expect(sqlLiteral('oracle', column('TIMESTAMP'), '2024-05-01 10:00:00')).toBe("TIMESTAMP '2024-05-01 10:00:00'");
    expect(sqlLiteral('postgresql', column('INTEGER'), 'abc')).toBe("'abc'");
  });
});

const shop = (dialect: DialectId) => {
  const b = makeProject(dialect);
  const cliente = b.entity('cliente');
  cliente.attributes.push(createAttribute(dialect, { name: 'nombre', type: dialect === 'sqlserver' ? 'NVARCHAR' : 'VARCHAR', length: 60 }));
  const pedido = b.entity('pedido');
  b.relate([cliente, pedido], '1:N');
  const schema = buildSchema(b.project);
  const pedidoTable = schema.tables.find((t) => t.id === pedido.id)!;
  const [cId, cNombre] = cliente.attributes.map((a) => a.id);
  const fkCol = pedidoTable.columns.find((c) => c.origin === 'fk')!.id;
  b.project.records = {
    [pedido.id]: [{ id: 'p1', values: { [pedido.attributes[0].id]: '10', [fkCol]: '1' } }],
    [cliente.id]: [
      { id: 'c1', values: { [cId]: '1', [cNombre]: 'Ana, "la jefa"' } },
      { id: 'c2', values: { [cId]: '2' } },
    ],
  };
  b.project.databaseName = 'tienda';
  return { project: b.project, schema: buildSchema(b.project), cliente, pedido };
};

describe('generateInserts', () => {
  it('inserts referenced tables first, with NULL for blanks', () => {
    const { project, schema } = shop('postgresql');
    const { sql, rowCount, invalidCells } = generateInserts(project, schema);
    expect(rowCount).toBe(3);
    expect(invalidCells).toBe(0);
    expect(sql).toContain('\\connect tienda');
    expect(sql).toContain("INSERT INTO cliente (id, nombre) VALUES\n  (1, 'Ana, \"la jefa\"'),\n  (2, NULL);");
    expect(sql.indexOf('INSERT INTO cliente')).toBeLessThan(sql.indexOf('INSERT INTO pedido'));
    expect(sql).toContain("SELECT setval(pg_get_serial_sequence('cliente', 'id'), COALESCE(MAX(id), 1)) FROM cliente;");
  });

  it('turns IDENTITY_INSERT on around explicit keys in SQL Server', () => {
    const { project, schema } = shop('sqlserver');
    const { sql } = generateInserts(project, schema);
    expect(sql).toContain('SET IDENTITY_INSERT cliente ON;');
    expect(sql).toContain('SET IDENTITY_INSERT cliente OFF;');
  });

  it('writes one row per statement in Oracle', () => {
    const { project, schema } = shop('oracle');
    const { sql } = generateInserts(project, schema);
    expect(sql.match(/INSERT INTO cliente/g)).toHaveLength(2);
  });
});

describe('CSV and JSON', () => {
  it('quotes fields with commas and quotes', () => {
    const { project, schema, cliente } = shop('postgresql');
    const table = schema.tables.find((t) => t.id === cliente.id)!;
    expect(tableToCsv(table, project.records![cliente.id])).toBe('id,nombre\r\n1,"Ana, ""la jefa"""\r\n2,\r\n');
  });

  it('uses native numbers, booleans and null', () => {
    expect(jsonValue('postgresql', column('INTEGER'), '7')).toBe(7);
    expect(jsonValue('postgresql', column('NUMERIC'), '7.50')).toBe(7.5);
    expect(jsonValue('postgresql', column('BOOLEAN'), '0')).toBe(false);
    expect(jsonValue('postgresql', column('VARCHAR'), '')).toBeNull();
    const { project, schema } = shop('postgresql');
    const data = JSON.parse(recordsToJson(project, schema));
    expect(data.cliente).toEqual([
      { id: 1, nombre: 'Ana, "la jefa"' },
      { id: 2, nombre: null },
    ]);
  });
});
