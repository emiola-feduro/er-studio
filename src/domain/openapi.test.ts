import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createSampleProject } from '../lib/sample-project';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { buildOpenApi, openApiJson, openApiYaml, type OpenApiDocument } from './openapi';
import { generateRandomModel, fillRandomRecords, THEMES } from './random-model';
import { seededRng } from './random-values';

const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Structural checks that import tools rely on. Returns a list of problems. */
const problems = (doc: OpenApiDocument) => {
  const found: string[] = [];
  const resolve = (pointer: string) =>
    pointer
      .replace(/^#\//, '')
      .split('/')
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], doc);
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${path}/${i}`));
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === 'string' && resolve(obj.$ref) === undefined) found.push(`${path}: unresolved ${obj.$ref}`);
    if ('type' in obj && path.includes('schema') || path.includes('/properties/')) {
      const types = Array.isArray(obj.type) ? obj.type : obj.type === undefined ? [] : [obj.type];
      for (const type of types) if (typeof type === 'string' && !TYPES.has(type)) found.push(`${path}: bad type ${type}`);
    }
    if (Array.isArray(obj.required) && obj.properties && typeof obj.properties === 'object') {
      for (const name of obj.required as string[]) if (!(name in (obj.properties as object))) found.push(`${path}: required ${name} missing`);
    }
    for (const [key, value] of Object.entries(obj)) walk(value, `${path}/${key}`);
  };
  walk(doc, '#');
  const operationIds = new Set<string>();
  for (const [route, item] of Object.entries(doc.paths)) {
    const declared = new Set([...(((item.parameters as { name: string; in: string }[]) ?? []).filter((p) => p.in === 'path').map((p) => p.name))]);
    for (const name of route.match(/\{([^}]+)\}/g) ?? []) if (!declared.has(name.slice(1, -1))) found.push(`${route}: undeclared ${name}`);
    for (const method of METHODS) {
      const op = item[method] as { operationId?: string } | undefined;
      if (!op) continue;
      if (!op.operationId || operationIds.has(op.operationId)) found.push(`${route} ${method}: operationId ${op.operationId}`);
      operationIds.add(op.operationId!);
    }
  }
  return found;
};

describe('buildOpenApi', () => {
  it('documents the sample store as a valid CRUD API', () => {
    const project = createSampleProject();
    const doc = buildOpenApi(project, buildSchema(project), { serverUrl: 'https://api.example.com' });
    expect(problems(doc)).toEqual([]);
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/cliente', '/cliente/{id}', '/pedido_producto', '/pedido_producto/{pedido_id}/{producto_id}']),
    );
    expect(Object.keys(doc.paths['/cliente/{id}'])).toEqual(['parameters', 'get', 'put', 'patch', 'delete']);
  });

  it('maps column types, nullability, ENUM, FKs and generated keys', () => {
    const b = makeProject('postgresql');
    const cliente = b.entity('clientes');
    cliente.attributes.push(
      createAttribute('postgresql', { name: 'email', type: 'VARCHAR', length: 160, nullable: false }),
      createAttribute('postgresql', { name: 'nota', type: 'TEXT', nullable: true }),
      createAttribute('postgresql', { name: 'estado', type: 'ENUM', enumValues: ['A', 'B'], nullable: true }),
      createAttribute('postgresql', { name: 'activo', type: 'BOOLEAN', nullable: false, defaultValue: 'TRUE' }),
      createAttribute('postgresql', { name: 'alta', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }),
      createAttribute('postgresql', { name: 'codigo', type: 'UUID', nullable: false }),
    );
    b.relate([cliente, b.entity('pedidos')], '1:N');
    const doc = buildOpenApi(b.project, buildSchema(b.project));
    const read = doc.components.schemas.Clientes as { properties: Record<string, Record<string, unknown>>; required: string[] };
    const create = doc.components.schemas.ClientesCreate as { properties: Record<string, unknown>; required: string[] };
    expect(read.properties.id).toMatchObject({ type: 'integer', readOnly: true });
    expect(read.properties.email).toMatchObject({ type: 'string', maxLength: 160 });
    expect(read.properties.nota).toMatchObject({ type: ['string', 'null'] });
    expect(read.properties.estado).toMatchObject({ type: ['string', 'null'], enum: ['A', 'B', null] });
    expect(read.properties.activo).toMatchObject({ type: 'boolean', default: true });
    expect(read.properties.alta).toMatchObject({ type: 'string', format: 'date-time' });
    expect(read.properties.alta).not.toHaveProperty('default');
    expect(read.properties.codigo).toMatchObject({ format: 'uuid' });
    expect(create.properties).not.toHaveProperty('id');
    expect(create.required).toEqual(['email', 'codigo']);
    const pedidos = doc.components.schemas.Pedidos as { properties: Record<string, { description: string }> };
    expect(pedidos.properties.clientes_id.description).toContain('Referencia a clientes.id');
    const list = doc.paths['/pedidos'].get as { parameters: { name?: string }[] };
    expect(list.parameters.map((p) => p.name)).toContain('clientes_id');
  });

  it('uses the first record as the example', () => {
    const project = createSampleProject();
    const doc = buildOpenApi(project, buildSchema(project));
    expect((doc.components.schemas.Cliente as { example: Record<string, unknown> }).example).toMatchObject({ id: 1, nombre: 'Ana Pérez' });
  });

  it('can document only some tables', () => {
    const project = createSampleProject();
    const schema = buildSchema(project);
    const id = schema.tables.find((t) => t.name === 'producto')!.id;
    const doc = buildOpenApi(project, schema, { tableIds: [id] });
    expect(Object.keys(doc.paths)).toEqual(['/producto', '/producto/{id}']);
  });

  it('stays valid for every random theme in every gestor', () => {
    for (const theme of THEMES) {
      for (const dialect of ['postgresql', 'mysql', 'sqlite', 'sqlserver', 'oracle'] as const) {
        const project = generateRandomModel({ dialect, entityCount: 99, themeId: theme.id, rng: seededRng(4) });
        fillRandomRecords(project, 3, seededRng(5));
        expect(problems(buildOpenApi(project, buildSchema(project))), `${theme.id} ${dialect}`).toEqual([]);
      }
    }
  });

  it('writes YAML that reads back as the same document', async () => {
    const project = createSampleProject();
    const doc = buildOpenApi(project, buildSchema(project));
    expect(parse(await openApiYaml(doc))).toEqual(JSON.parse(openApiJson(doc)));
  });
});
