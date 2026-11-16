import { describe, expect, it } from 'vitest';
import { createSampleProject } from '../lib/sample-project';
import { buildSchema } from './inference';
import { renameAliases, buildSelect } from './query-builder';

const setup = () => {
  const project = createSampleProject();
  const schema = buildSchema(project);
  const id = (name: string) => schema.tables.find((t) => t.name === name)!.id;
  return { project, schema, id };
};

describe('buildSelect', () => {
  it('joins two related tables through their FK', () => {
    const { schema, id } = setup();
    const { sql, plan } = buildSelect(schema, 'postgresql', { tableIds: [id('cliente'), id('pedido')] });
    expect(sql).toContain('FROM cliente cl\nJOIN pedido pe ON pe.cliente_id = cl.id');
    expect(plan.joins).toHaveLength(1);
    expect(sql).toContain('cl.nombre');
  });

  it('adds the junction table between many-to-many tables', () => {
    const { schema, id } = setup();
    const { sql, plan } = buildSelect(schema, 'postgresql', { tableIds: [id('pedido'), id('producto')] });
    expect(plan.joins.map((j) => [j.alias, j.bridge])).toEqual([
      ['pp', true],
      ['pr', false],
    ]);
    expect(sql).toContain('JOIN pedido_producto pp ON pp.pedido_id = pe.id');
    expect(sql).toContain('JOIN producto pr ON pp.producto_id = pr.id');
    expect(sql).not.toContain('pp.cantidad');
  });

  it('aliases repeated column names and honours chosen columns, joins, filters, order and limit', () => {
    const { schema, id } = setup();
    const cliente = schema.tables.find((t) => t.id === id('cliente'))!;
    const producto = schema.tables.find((t) => t.id === id('producto'))!;
    const name = (t: typeof cliente, n: string) => t.columns.find((c) => c.name === n)!.id;
    const spec = {
      tableIds: [id('cliente'), id('producto')],
      columns: { [id('cliente')]: [name(cliente, 'nombre')], [id('producto')]: [name(producto, 'nombre'), name(producto, 'precio')] },
      joinTypes: { [id('pedido')]: 'LEFT' as const },
      where: 'pr.precio > 10',
      orderBy: [{ tableId: id('producto'), columnId: name(producto, 'precio'), direction: 'DESC' as const }],
      limit: 20,
      distinct: true,
    };
    const pg = buildSelect(schema, 'postgresql', spec).sql;
    expect(pg).toContain('SELECT DISTINCT \n  cl.nombre AS cliente_nombre,\n  pr.nombre AS producto_nombre,\n  pr.precio');
    expect(pg).toContain('LEFT JOIN pedido pe');
    expect(pg).toContain('WHERE pr.precio > 10\nORDER BY pr.precio DESC\nLIMIT 20;');
    expect(buildSelect(schema, 'sqlserver', spec).sql).toContain('SELECT DISTINCT TOP (20) ');
    expect(buildSelect(schema, 'oracle', spec).sql).toContain('FETCH FIRST 20 ROWS ONLY;');
    const multi = buildSelect(schema, 'postgresql', { ...spec, where: 'pr.precio > 10\n  AND (cl.nombre LIKE \'A%\'\nOR cl.nombre LIKE \'B%\')' }).sql;
    expect(multi).toContain("WHERE pr.precio > 10\n  AND (cl.nombre LIKE 'A%'\n  OR cl.nombre LIKE 'B%')\nORDER BY");
  });

  it('reports tables that cannot be reached', () => {
    const { schema, id } = setup();
    const { plan } = buildSelect(schema, 'postgresql', { tableIds: [id('cliente'), id('empleado')] });
    expect(plan.unreachable).toEqual(['empleado']);
  });

  it('uses LEFT JOIN by default when the FK accepts NULL', () => {
    const { project, schema, id } = setup();
    void project;
    const { plan } = buildSelect(schema, 'postgresql', { tableIds: [id('pedido'), id('cliente')] });
    expect(plan.joins[0].type).toBe('INNER');
  });
});

describe('typed aliases', () => {
  it('uses typed aliases everywhere and falls back when one cannot be used', () => {
    const { schema, id } = setup();
    const spec = {
      tableIds: [id('cliente'), id('producto')],
      aliases: { [id('cliente')]: 'c', [id('producto')]: 'select' },
      orderBy: [{ tableId: id('cliente'), columnId: schema.tables.find((t) => t.id === id('cliente'))!.columns[0].id, direction: 'ASC' as const }],
    };
    const { sql, plan } = buildSelect(schema, 'postgresql', spec);
    expect(sql).toContain('FROM cliente c\n');
    expect(sql).toContain('ON pe.cliente_id = c.id');
    expect(sql).toContain('ORDER BY c.id ASC');
    expect(plan.aliases[id('producto')]).toBe('pr');
    expect(plan.aliasProblems).toEqual({ [id('producto')]: 'reserved' });
    const duplicate = buildSelect(schema, 'postgresql', { ...spec, aliases: { [id('cliente')]: 'x', [id('producto')]: 'X' } }).plan;
    expect(duplicate.aliasProblems[id('producto')]).toBe('duplicate');
    expect(buildSelect(schema, 'postgresql', { ...spec, aliases: { [id('cliente')]: '1a' } }).plan.aliasProblems[id('cliente')]).toBe('invalid');
  });

  it('renames aliases in an expression without touching strings', () => {
    expect(renameAliases("cl.nombre = 'cl.x' AND pr.precio > 0 AND xcl.y = 1", { cl: 'c' })).toBe("c.nombre = 'cl.x' AND pr.precio > 0 AND xcl.y = 1");
    expect(renameAliases('a.x = b.y', { a: 'b', b: 'a' })).toBe('b.x = a.y');
  });
});
