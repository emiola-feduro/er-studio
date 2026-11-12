import { describe, expect, it } from 'vitest';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { nextAutoValue, typedValue, validateRecords, validateValue } from './records';
import type { DataRow } from './types';

const col = (type: string, extra: { length?: number; precision?: number; scale?: number } = {}) => ({ type, ...extra });

describe('validateValue', () => {
  it('checks integer syntax and ranges per gestor', () => {
    expect(validateValue('postgresql', col('INTEGER'), '42')).toBeNull();
    expect(validateValue('postgresql', col('INTEGER'), '4.2')).toMatch(/entero/);
    expect(validateValue('postgresql', col('SMALLINT'), '40000')).toMatch(/Fuera de rango/);
    expect(validateValue('mysql', col('TINYINT'), '200')).toMatch(/Fuera de rango/);
    expect(validateValue('sqlserver', col('TINYINT'), '200')).toBeNull();
    expect(validateValue('postgresql', col('BIGINT'), '9223372036854775807')).toBeNull();
    expect(validateValue('postgresql', col('BIGINT'), '9223372036854775808')).toMatch(/Fuera de rango/);
  });

  it('checks precision and scale of decimals', () => {
    const numeric = col('NUMERIC', { precision: 5, scale: 2 });
    expect(validateValue('postgresql', numeric, '123.45')).toBeNull();
    expect(validateValue('postgresql', numeric, '1234.5')).toMatch(/3 dígitos/);
    expect(validateValue('postgresql', numeric, '1.234')).toMatch(/2 decimales/);
    expect(validateValue('postgresql', numeric, '1,5')).toMatch(/punto/);
  });

  it('enforces the CHAR and VARCHAR limit', () => {
    expect(validateValue('postgresql', col('VARCHAR', { length: 5 }), 'hola')).toBeNull();
    expect(validateValue('postgresql', col('VARCHAR', { length: 5 }), 'hola mundo')).toBe('Máximo 5 caracteres (tiene 10).');
    expect(validateValue('postgresql', col('VARCHAR'), 'x'.repeat(256))).toMatch(/255/);
    expect(validateValue('oracle', col('CHAR', { length: 2 }), 'ñañ')).toMatch(/Máximo 2/);
  });

  it('checks dates, times and timestamps', () => {
    expect(validateValue('postgresql', col('DATE'), '2024-02-29')).toBeNull();
    expect(validateValue('postgresql', col('DATE'), '2023-02-29')).toMatch(/fecha válida/);
    expect(validateValue('postgresql', col('DATE'), '29/02/2024')).toMatch(/AAAA-MM-DD/);
    expect(validateValue('postgresql', col('TIME'), '23:59:59')).toBeNull();
    expect(validateValue('postgresql', col('TIME'), '24:00')).not.toBeNull();
    expect(validateValue('postgresql', col('TIMESTAMP'), '2024-05-01 10:30')).toBeNull();
    expect(validateValue('postgresql', col('TIMESTAMPTZ'), '2024-05-01T10:30:00+02:00')).toBeNull();
    expect(validateValue('postgresql', col('TIMESTAMP'), '2024-05-01 10:30+02:00')).not.toBeNull();
    expect(validateValue('oracle', col('DATE'), '2024-05-01 08:00:00')).toBeNull();
  });

  it('checks booleans, uuid, json, ip and hex', () => {
    expect(validateValue('postgresql', col('BOOLEAN'), 'TRUE')).toBeNull();
    expect(validateValue('postgresql', col('BOOLEAN'), 'sí')).toMatch(/true/);
    expect(validateValue('postgresql', col('UUID'), '123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    expect(validateValue('postgresql', col('UUID'), 'abc')).toMatch(/UUID/);
    expect(validateValue('postgresql', col('JSONB'), '{"a":1}')).toBeNull();
    expect(validateValue('postgresql', col('JSONB'), '{a:1}')).toMatch(/JSON/);
    expect(validateValue('postgresql', col('INET'), '192.168.0.1/24')).toBeNull();
    expect(validateValue('postgresql', col('INET'), '300.1.1.1')).toMatch(/IP/);
    expect(validateValue('mysql', col('BINARY', { length: 2 }), '0xABCDEF')).toMatch(/2 bytes/);
  });

  it('does not check custom types', () => {
    expect(validateValue('postgresql', col('GEOGRAPHY'), 'lo que sea')).toBeNull();
  });
});

const row = (id: string, values: Record<string, string>): DataRow => ({ id, values });

describe('validateRecords', () => {
  const setup = () => {
    const b = makeProject();
    const cliente = b.entity('cliente');
    cliente.attributes.push(createAttribute('postgresql', { name: 'email', type: 'VARCHAR', length: 20, nullable: false, unique: true }));
    const pedido = b.entity('pedido');
    const rel = b.relate([cliente, pedido], '1:N');
    const schema = buildSchema(b.project);
    const fkCol = schema.tables.find((t) => t.id === pedido.id)!.columns.find((c) => c.origin === 'fk')!;
    return { project: b.project, cliente, pedido, rel, schema, fkColId: fkCol.id, idOf: (e: typeof cliente) => e.attributes[0].id };
  };

  it('flags NOT NULL, UNIQUE, duplicated PK and type errors', () => {
    const { project, cliente, schema, idOf } = setup();
    const email = cliente.attributes[1].id;
    project.records = {
      [cliente.id]: [
        row('r1', { [idOf(cliente)]: '1', [email]: 'a@x.com' }),
        row('r2', { [idOf(cliente)]: '1', [email]: 'a@x.com' }),
        row('r3', { [idOf(cliente)]: 'x', [email]: '' }),
        row('r4', { [idOf(cliente)]: '', [email]: 'muy-largo-para-veinte@x.com' }),
      ],
    };
    const { cells, total } = validateRecords(project, schema);
    const t = cells.get(cliente.id)!;
    expect(t.get('r2')?.get(idOf(cliente))).toMatch(/único/);
    expect(t.get('r2')?.get(email)).toMatch(/único/);
    expect(t.get('r3')?.get(idOf(cliente))).toMatch(/entero/);
    expect(t.get('r3')?.get(email)).toMatch(/NOT NULL/);
    expect(t.get('r4')?.get(email)).toMatch(/Máximo 20/);
    // An empty auto increment PK is generated by the database, so it is not an error.
    expect(t.get('r4')?.get(idOf(cliente))).toBeUndefined();
    expect(total).toBe(5);
  });

  it('checks that FK values exist in the referenced table', () => {
    const { project, cliente, pedido, schema, fkColId, idOf } = setup();
    project.records = {
      [cliente.id]: [row('c1', { [idOf(cliente)]: '7', [cliente.attributes[1].id]: 'a@x.com' })],
      [pedido.id]: [row('p1', { [idOf(pedido)]: '1', [fkColId]: '7' }), row('p2', { [idOf(pedido)]: '2', [fkColId]: '8' })],
    };
    const t = validateRecords(project, schema).cells.get(pedido.id)!;
    expect(t.get('p1')).toBeUndefined();
    expect(t.get('p2')?.get(fkColId)).toBe('No existe un registro en cliente con (8).');
  });

  it('compares numbers canonically (07 equals 7)', () => {
    const { project, cliente, pedido, schema, fkColId, idOf } = setup();
    project.records = {
      [cliente.id]: [row('c1', { [idOf(cliente)]: '7', [cliente.attributes[1].id]: 'a' })],
      [pedido.id]: [row('p1', { [idOf(pedido)]: '1', [fkColId]: '07' })],
    };
    expect(validateRecords(project, schema).total).toBe(0);
  });

  it('records of deleted tables are dropped by syncJunctions', () => {
    const b = makeProject();
    const e = b.entity('e');
    b.project.records = { [e.id]: [row('r', {})], missing: [row('x', {})] };
    b.sync();
    expect(Object.keys(b.project.records)).toEqual([e.id]);
  });
});

describe('helpers', () => {
  it('nextAutoValue continues after the largest integer', () => {
    expect(nextAutoValue([row('a', { c: '3' }), row('b', { c: '10' }), row('c', { c: 'x' })], 'c')).toBe('11');
    expect(nextAutoValue([], 'c')).toBe('1');
  });

  it('typedValue converts valid values to native types', () => {
    const base = { id: 'c', name: 'c', nullable: true, unique: false, autoIncrement: false, pk: false, origin: 'attribute' as const };
    expect(typedValue('postgresql', { ...base, type: 'INTEGER' }, '12')).toBe(12);
    expect(typedValue('postgresql', { ...base, type: 'BIGINT' }, '9223372036854775807')).toBe('9223372036854775807');
    expect(typedValue('postgresql', { ...base, type: 'BOOLEAN' }, '0')).toBe(false);
    expect(typedValue('postgresql', { ...base, type: 'DATE' }, '2024-01-31')).toEqual(new Date('2024-01-31T00:00:00Z'));
    expect(typedValue('postgresql', { ...base, type: 'INTEGER' }, 'abc')).toBe('abc');
    expect(typedValue('postgresql', { ...base, type: 'INTEGER' }, '')).toBeNull();
  });
});
