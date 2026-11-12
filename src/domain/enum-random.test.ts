import { describe, expect, it } from 'vitest';
import { generateDdl } from './ddl';
import { convertType, DIALECTS, enumStorage } from './dialects';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { canRandomize, generateRows, randomCellValue, randomValue, seededRng } from './random-values';
import { validateRecords, validateValue } from './records';
import type { Column, DialectId, Project } from './types';
import { validateProject } from './validation';

const STATUS = ['APPROVED', 'PENDING', 'REJECTED'];

const withEnum = (dialect: DialectId, values = STATUS) => {
  const b = makeProject(dialect);
  const solicitud = b.entity('solicitud');
  solicitud.attributes.push(createAttribute(dialect, { name: 'estado', type: 'ENUM', length: undefined, enumValues: values, nullable: false }));
  return { b, solicitud };
};

describe('ENUM', () => {
  it('is offered by every gestor', () => {
    for (const dialect of Object.values(DIALECTS)) expect(dialect.types.some((t) => t.name === 'ENUM')).toBe(true);
  });

  it('is stored as a string sized to the longest value, TEXT in SQLite', () => {
    expect(enumStorage('sqlserver', STATUS)).toEqual({ type: 'VARCHAR', length: 8 });
    expect(enumStorage('postgresql', STATUS)).toEqual({ type: 'VARCHAR', length: 8 });
    expect(enumStorage('mysql', STATUS)).toEqual({ type: 'VARCHAR', length: 8 });
    expect(enumStorage('oracle', STATUS)).toEqual({ type: 'VARCHAR2', length: 8 });
    expect(enumStorage('sqlite', STATUS)).toEqual({ type: 'TEXT' });
    expect(enumStorage('sqlserver', ['sí', 'no'])).toEqual({ type: 'NVARCHAR', length: 2 });
    expect(enumStorage('oracle', ['sí', 'no'])).toEqual({ type: 'VARCHAR2', length: 3 });
  });

  it('adds a CHECK with the allowed values to the DDL', () => {
    const { b } = withEnum('sqlserver');
    const { sql } = generateDdl(buildSchema(b.project), 'sqlserver');
    expect(sql).toContain('estado VARCHAR(8) NOT NULL');
    expect(sql).toContain("CONSTRAINT ck_solicitud_estado CHECK (estado IN ('APPROVED', 'PENDING', 'REJECTED'))");

    const sqlite = withEnum('sqlite');
    expect(generateDdl(buildSchema(sqlite.b.project), 'sqlite').sql).toContain('estado TEXT NOT NULL');
  });

  it('escapes quotes in values', () => {
    const { b } = withEnum('postgresql', ["it's", 'ok']);
    expect(generateDdl(buildSchema(b.project), 'postgresql').sql).toContain("CHECK (estado IN ('it''s', 'ok'))");
  });

  it('FK columns pointing to an ENUM key get the storage type and no CHECK', () => {
    const b = makeProject('postgresql');
    const tipo = b.entity('tipo');
    tipo.attributes[0] = createAttribute('postgresql', { name: 'codigo', type: 'ENUM', enumValues: ['A', 'BB'], pk: true, nullable: false });
    b.relate([tipo, b.entity('item')], '1:N');
    const { sql } = generateDdl(buildSchema(b.project), 'postgresql');
    expect(sql).toContain('tipo_codigo VARCHAR(2) NOT NULL');
    expect(sql.match(/CHECK/g)).toHaveLength(1);
  });

  it('survives a change of gestor', () => {
    expect(convertType('postgresql', 'oracle', { type: 'ENUM' })).toEqual({ type: 'ENUM' });
  });

  it('flags an ENUM without values', () => {
    const { b } = withEnum('postgresql', []);
    const issues = validateProject(b.project, buildSchema(b.project));
    expect(issues.some((i) => i.message.includes('no tiene valores permitidos'))).toBe(true);
  });

  it('flags a default value that is not allowed', () => {
    const { b, solicitud } = withEnum('postgresql');
    solicitud.attributes[1].defaultValue = "'pendiente'";
    const messages = () => validateProject(b.project, buildSchema(b.project)).map((i) => i.message);
    expect(messages().some((m) => m.includes("el valor por defecto 'pendiente' no está entre los permitidos"))).toBe(true);
    solicitud.attributes[1].defaultValue = "'PENDING'";
    expect(messages().some((m) => m.includes('valor por defecto'))).toBe(false);
  });

  it('accepts only the allowed values in records', () => {
    const column = { type: 'ENUM', enumValues: STATUS };
    expect(validateValue('postgresql', column, 'PENDING')).toBeNull();
    expect(validateValue('postgresql', column, 'pending')).toBe('Valores permitidos: APPROVED, PENDING, REJECTED.');
  });
});

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

describe('random values', () => {
  it('every generated value passes the type validation', () => {
    const rng = seededRng(7);
    const cases: [DialectId, Column][] = [
      ['postgresql', column('INTEGER')],
      ['mysql', column('TINYINT')],
      ['postgresql', column('NUMERIC', { precision: 5, scale: 2 })],
      ['postgresql', column('NUMERIC', { precision: 2, scale: 2 })],
      ['oracle', column('NUMBER', { precision: 1, scale: 0 })],
      ['postgresql', column('REAL')],
      ['postgresql', column('BOOLEAN')],
      ['postgresql', column('VARCHAR', { length: 3, name: 'descripcion' })],
      ['postgresql', column('CHAR', { length: 1 })],
      ['postgresql', column('VARCHAR', { length: 160, name: 'email' })],
      ['postgresql', column('TEXT', { name: 'nombre' })],
      ['postgresql', column('DATE')],
      ['postgresql', column('TIME')],
      ['postgresql', column('TIMESTAMP')],
      ['postgresql', column('TIMESTAMPTZ')],
      ['mysql', column('YEAR')],
      ['postgresql', column('UUID')],
      ['postgresql', column('INET')],
      ['sqlserver', column('ENUM', { enumValues: STATUS })],
    ];
    for (let i = 0; i < 200; i += 1) {
      for (const [dialect, col] of cases) {
        const value = randomValue(dialect, col, rng);
        expect(value, `${dialect} ${col.type}`).not.toBeNull();
        expect(validateValue(dialect, col, value!), `${dialect} ${col.type} -> ${value}`).toBeNull();
      }
    }
  });

  it('skips complex types', () => {
    for (const type of ['JSONB', 'XML', 'BYTEA', 'INTERVAL']) {
      expect(canRandomize('postgresql', { type })).toBe(false);
      expect(randomValue('postgresql', column(type), Math.random)).toBeNull();
    }
    expect(canRandomize('postgresql', { type: 'MI_TIPO' })).toBe(false);
  });

  it('guesses plausible text from the column name', () => {
    const rng = seededRng(1);
    expect(randomValue('postgresql', column('VARCHAR', { length: 100, name: 'correo' }), rng)).toMatch(/^[a-z.]+\d+@ejemplo\.com$/);
  });
});

describe('generateRows', () => {
  const shop = () => {
    const b = makeProject('postgresql');
    const cliente = b.entity('cliente');
    cliente.attributes.push(createAttribute('postgresql', { name: 'email', type: 'VARCHAR', length: 40, unique: true, nullable: false }));
    cliente.attributes.push(createAttribute('postgresql', { name: 'estado', type: 'ENUM', enumValues: STATUS, nullable: false }));
    const producto = b.entity('producto');
    b.relate([cliente, producto], 'N:M');
    return { project: b.project, cliente, producto, junctionId: b.project.entities[2].id };
  };

  const fill = (project: Project, tableId: string, count: number, seed: number) => {
    const { rows, missingRefs } = generateRows(project, buildSchema(project), tableId, count, seededRng(seed));
    project.records ??= {};
    project.records[tableId] = [...(project.records[tableId] ?? []), ...rows.map((values, i) => ({ id: `${tableId}-${seed}-${i}`, values }))];
    return missingRefs;
  };

  it('fills valid rows: sequential keys, unique emails, FKs to existing rows, no repeated junction PK', () => {
    const { project, cliente, producto, junctionId } = shop();
    expect(fill(project, junctionId, 3, 1)).toEqual(['cliente', 'producto']);
    project.records = {};

    fill(project, cliente.id, 30, 2);
    fill(project, producto.id, 5, 3);
    expect(fill(project, junctionId, 40, 4)).toEqual([]);
    fill(project, cliente.id, 5, 5);

    const issues = validateRecords(project, buildSchema(project));
    expect(issues.total).toBe(0);
    expect(project.records[cliente.id].map((r) => r.values[cliente.attributes[0].id]).slice(0, 3)).toEqual(['1', '2', '3']);
    expect(project.records[junctionId]).toHaveLength(40);
  });

  it('randomCellValue picks an existing value for FK cells', () => {
    const { project, cliente, producto, junctionId } = shop();
    fill(project, cliente.id, 3, 1);
    fill(project, producto.id, 3, 2);
    fill(project, junctionId, 1, 3);
    const schema = buildSchema(project);
    const fkColumn = schema.tables.find((t) => t.id === junctionId)!.columns[0];
    const row = project.records![junctionId][0];
    const value = randomCellValue(project, schema, junctionId, row.id, fkColumn.id, seededRng(9));
    expect(['1', '2', '3']).toContain(value);
  });
});
