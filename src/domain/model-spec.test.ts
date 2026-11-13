import { describe, expect, it } from 'vitest';
import { generateDdl } from './ddl';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { buildModelSpec, toAgentJson, toAgentMarkdown } from './model-spec';
import { createAttribute } from './model';

const shop = () => {
  const b = makeProject('postgresql');
  const cliente = b.entity('clientes');
  cliente.attributes.push(createAttribute('postgresql', { name: 'email', type: 'VARCHAR', length: 160, unique: true, nullable: false }));
  const pedido = b.entity('pedidos');
  pedido.attributes.push(createAttribute('postgresql', { name: 'estado', type: 'ENUM', enumValues: ['A', 'B'], nullable: false, defaultValue: "'A'" }));
  const producto = b.entity('productos');
  const compra = b.relate([cliente, pedido], '1:N');
  compra.name = 'realiza';
  compra.onDelete = 'CASCADE';
  b.relate([pedido, producto], 'N:M');
  const empleado = b.entity('empleados');
  const jefe = b.relate([empleado, empleado], '1:N');
  jefe.participants[0].role = 'jefe';
  jefe.participants[1].role = 'subordinado';
  return { project: b.project, schema: buildSchema(b.project) };
};

describe('buildModelSpec', () => {
  it('describes columns with types, keys, FK targets and ENUM values', () => {
    const { project, schema } = shop();
    const spec = buildModelSpec(project, schema);
    const pedidos = spec.entities.find((e) => e.name === 'pedidos')!;
    expect(pedidos.primaryKey).toEqual(['id']);
    expect(pedidos.columns.find((c) => c.name === 'estado')).toMatchObject({ logicalType: 'enum', sqlType: 'VARCHAR(1)', enumValues: ['A', 'B'], default: "'A'", nullable: false });
    expect(pedidos.columns.find((c) => c.name === 'clientes_id')).toMatchObject({ references: { table: 'clientes', column: 'id' }, nullable: false });
    expect(pedidos.columns.find((c) => c.name === 'id')).toMatchObject({ primaryKey: true, autoIncrement: true, logicalType: 'int' });
  });

  it('describes relationships from each side, with junctions as many-to-many', () => {
    const { project, schema } = shop();
    const spec = buildModelSpec(project, schema);
    const relations = (name: string) => spec.entities.find((e) => e.name === name)!.relations;
    expect(relations('pedidos')).toContainEqual(expect.objectContaining({ kind: 'many-to-one', targets: ['clientes'], name: 'realiza', onDelete: 'CASCADE', optional: false }));
    expect(relations('clientes')).toContainEqual(expect.objectContaining({ kind: 'one-to-many', targets: ['pedidos'] }));
    expect(relations('pedidos')).toContainEqual(expect.objectContaining({ kind: 'many-to-many', targets: ['productos'], via: 'pedidos_productos' }));
    expect(relations('productos')).toContainEqual(expect.objectContaining({ kind: 'many-to-many', targets: ['pedidos'], via: 'pedidos_productos' }));
    const junction = spec.entities.find((e) => e.name === 'pedidos_productos')!;
    expect(junction.kind).toBe('junction');
    expect(junction.primaryKey).toEqual(['pedidos_id', 'productos_id']);
    expect(relations('empleados').map((r) => r.kind).sort()).toEqual(['many-to-one', 'one-to-many']);
    expect(relations('empleados').find((r) => r.kind === 'many-to-one')!.optional).toBe(true);
  });

  it('can describe just some tables', () => {
    const { project, schema } = shop();
    const id = schema.tables.find((t) => t.name === 'clientes')!.id;
    expect(buildModelSpec(project, schema, [id]).entities.map((e) => e.name)).toEqual(['clientes']);
  });
});

describe('agent output', () => {
  it('writes Markdown with the target, notes, a column table and the DDL', () => {
    const { project, schema } = shop();
    const ddl = generateDdl(schema, 'postgresql').sql;
    const md = toAgentMarkdown(buildModelSpec(project, schema), { target: 'Prisma', notes: 'Usa camelCase', ddl });
    expect(md).toContain('Genera los modelos para Prisma');
    expect(md).toContain('Notas adicionales: Usa camelCase');
    expect(md).toContain('## pedidos');
    expect(md).toContain('| estado | VARCHAR(1) | enum | no |  | valores: A, B; DEFAULT \'A\' |');
    expect(md).toContain('FK → clientes.id');
    expect(md).toContain('**realiza**: muchos a uno con clientes');
    expect(md).toContain('```sql\n');
  });

  it('asks the agent for a technology when none is given', () => {
    const { project, schema } = shop();
    expect(toAgentMarkdown(buildModelSpec(project, schema), {})).toContain('pregunta el lenguaje y el framework');
  });

  it('writes JSON a program can read', () => {
    const { project, schema } = shop();
    const data = JSON.parse(toAgentJson(buildModelSpec(project, schema), { target: 'Kotlin data classes' }));
    expect(data).toMatchObject({ format: 'er-studio.model-spec', version: 1, target: 'Kotlin data classes', dialect: 'PostgreSQL' });
    expect(data.entities).toHaveLength(5);
  });
});
