import { describe, expect, it } from 'vitest';
import { createSampleProject } from '../lib/sample-project';
import { buildSchema } from './inference';
import { sqlCompletions, tableRefs } from './sql-completion';

const schema = buildSchema(createSampleProject());
const at = (text: string) => {
  const caret = text.indexOf('|');
  const clean = text.replace('|', '');
  const result = sqlCompletions(clean, caret < 0 ? clean.length : caret, schema, 'postgresql', 'texto');
  return { ...result, labels: result.items.map((i) => i.label) };
};

describe('sqlCompletions', () => {
  it('starts with SELECT', () => {
    expect(at('').labels).toEqual(['SELECT', 'WITH']);
    expect(at('sel').labels).toEqual(['SELECT']);
  });

  it('offers the tables after FROM and JOIN', () => {
    expect(at('SELECT * FROM ').labels).toEqual(['cliente', 'pedido', 'producto', 'empleado', 'pedido_producto']);
    expect(at('SELECT * FROM cliente c JOIN ped').labels).toEqual(['pedido', 'pedido_producto']);
  });

  it('builds the ON condition from the foreign keys', () => {
    expect(at('SELECT * FROM cliente c JOIN pedido p ').labels[0]).toBe('ON p.cliente_id = c.id');
    expect(at('SELECT * FROM cliente c JOIN pedido p ON ').labels[0]).toBe('p.cliente_id = c.id');
  });

  it('offers the columns of an alias after the dot', () => {
    const result = at('SELECT c.| FROM cliente c');
    expect(result.labels).toEqual(['id', 'nombre', 'email', 'creado_en']);
    expect(result.items[1].detail).toBe('varchar(120)');
  });

  it('offers the query columns and functions in SELECT', () => {
    expect(at('SELECT nom| FROM cliente').labels).toEqual(['nombre']);
    expect(at('SELECT c.nombre, cou| FROM cliente c').labels).toEqual(['COUNT()']);
    expect(at('SELECT nom| FROM cliente c JOIN pedido p ON p.cliente_id = c.id').labels).toEqual(['c.nombre']);
  });

  it('offers operators for the column type in WHERE', () => {
    const labels = at('SELECT * FROM producto p WHERE p.precio ').labels;
    expect(labels).toContain('BETWEEN 1 AND 100');
    expect(labels).toContain('NOT IN (1, 2, 3)');
    expect(at("SELECT * FROM cliente WHERE nombre ").labels).toContain("LIKE '%texto%'");
  });

  it('offers what can follow FROM and in WHERE', () => {
    expect(at('SELECT * FROM cliente c ').labels).toContain('WHERE');
    expect(at('SELECT * FROM cliente c WHERE c.id > 1 a').labels).toContain('AND');
    expect(at("SELECT * FROM cliente c WHERE c.nombre LIKE '%a%' ").labels.slice(0, 2)).toEqual(['AND', 'OR']);
    expect(at('SELECT * FROM cliente c WHERE c.id > 10 ').labels[0]).toBe('AND');
  });

  it('offers nothing inside strings and comments', () => {
    expect(at("SELECT * FROM cliente WHERE nombre = 'cl").labels).toEqual([]);
    expect(at('-- sel').labels).toEqual([]);
  });

  it('replaces the whole word under the cursor', () => {
    const result = at('SELECT * FROM cli|ente');
    expect([result.from, result.to]).toEqual([14, 21]);
  });

  it('reads the tables and aliases of the query', () => {
    expect(tableRefs('SELECT * FROM cliente AS c, producto JOIN pedido pe ON 1=1 WHERE x', schema).map((r) => `${r.table.name}:${r.alias ?? ''}`)).toEqual([
      'cliente:c',
      'producto:',
      'pedido:pe',
    ]);
  });

  it('does not offer a column already in the SELECT list', () => {
    const labels = at('SELECT cliente.id, cliente.nombre, ').labels;
    expect(labels).not.toContain('cliente.id');
    expect(labels).not.toContain('cliente.nombre');
    expect(labels[0]).toBe('cliente.email');
    expect(at('SELECT c.id, c.| FROM cliente c').labels).toEqual(['nombre', 'email', 'creado_en']);
    expect(at('SELECT id, | FROM cliente').labels).not.toContain('id');
  });

  it('offers nothing after AS, where a name is being written', () => {
    expect(at('SELECT cliente.id AS ').labels).toEqual([]);
    expect(at('SELECT cliente.id AS id').labels).toEqual([]);
    expect(at('SELECT * FROM cliente AS ').labels).toEqual([]);
  });

  it('puts the tables the SELECT uses first in FROM, with their alias', () => {
    expect(at('SELECT cliente.id, cliente.nombre FROM ').labels[0]).toBe('cliente');
    expect(at('SELECT c.nombre, c.email FROM ').labels.slice(0, 2)).toEqual(['cliente c', 'pedido']);
    expect(at('SELECT c.nombre, c.email FROM cliente c JOIN ').labels[0]).toBe('pedido');
    expect(at('SELECT pr.precio FROM ').labels[0]).toBe('producto pr');
  });

  it('after JOIN puts related tables first and the ones in the query last', () => {
    const labels = at('SELECT * FROM cliente c JOIN ').labels;
    expect(labels[0]).toBe('pedido');
    expect(labels[labels.length - 1]).toBe('cliente');
  });
});

