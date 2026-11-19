import { describe, expect, it } from 'vitest';
import { generateDdl } from '../ddl';
import { buildSchema } from '../inference';
import { validateRecords } from '../records';
import { importIr } from '.';
import { copyRows, postgresCell, type RowPage } from './copy-rows';
import type { Ir } from './ir';
import fixture from './fixtures/postgres-schema.json';

/** What the desktop side read from a real PostgreSQL 17 (crates/er-db/tests/introspect.rs). */
const read = fixture as unknown as { ir: Ir; sources: { name: string; schema: string; table: string; key: string[] }[] };

const project = () => importIr(structuredClone(read.ir), 'sql', { name: 'tienda', dialect: 'postgresql', namesLocale: 'es' });

describe('a schema read from PostgreSQL', () => {
  it('becomes entities and relationships like the same DDL would', () => {
    const { project: p, report } = project();
    expect(p.dialect).toBe('postgresql');
    expect(p.databaseName).toBe('tienda');
    // pedido_producto has its own column (cantidad), so it stays a table of its own, as when importing the DDL.
    expect(p.entities.map((e) => e.name).sort()).toEqual(['archivo_cliente', 'pedido', 'pedido_producto', 'producto', 'tienda_cliente']);
    expect(report.warnings).toEqual(expect.arrayContaining(['skipped:VIEW v_clientes', 'skipped:INDEX idx_cliente_lower (expression)']));
    const pedido = p.entities.find((e) => e.name === 'pedido')!;
    expect(pedido.attributes.find((a) => a.name === 'estado')).toMatchObject({ type: 'ENUM', enumValues: ['nuevo', 'pagado', 'enviado'] });
    expect(pedido.attributes.find((a) => a.name === 'id')).toMatchObject({ autoIncrement: true });
    const cliente = p.entities.find((e) => e.name === 'tienda_cliente')!;
    expect(cliente.attributes.find((a) => a.name === 'tipo')).toMatchObject({ type: 'ENUM', enumValues: ['persona', 'empresa'] });
    const junction = buildSchema(p).tables.find((t) => t.name === 'pedido_producto')!;
    expect(junction.foreignKeys).toHaveLength(2);
    expect(junction.pk?.columnIds).toHaveLength(2);
  });

  it('gives back DDL with the same tables, keys and indexes', () => {
    const schema = buildSchema(project().project);
    const ddl = generateDdl(schema, 'postgresql').sql;
    expect(ddl).toMatch(/CREATE TABLE "?pedido_producto"?/);
    expect(ddl).toMatch(/ON DELETE CASCADE/);
    expect(ddl).toMatch(/idx_pedido_creado/);
    expect(ddl).toMatch(/WHERE \(estado = 'pagado'::tienda\.estado_pedido\)/);
  });

  it('copies rows printed by PostgreSQL into valid records', async () => {
    const { project: p } = project();
    const pages: Record<string, RowPage> = {
      tienda_cliente: {
        columns: ['id', 'nombre', 'email', 'activo', 'tipo', 'foto'],
        values: [
          ['1', 'Ana', 'ana@x.com', 't', 'persona', '\\xcafe'],
          ['2', 'Luis', null, 'f', 'empresa', null],
        ],
      },
      producto: { columns: ['id', 'nombre', 'precio', 'precio_iva'], values: [['1', 'Lápiz', '1.50', '1.74']] },
      pedido: { columns: ['id', 'cliente_id', 'creado', 'estado'], values: [['1', '1', '2026-01-10 12:00:00+00', 'pagado']] },
      pedido_producto: { columns: ['pedido_id', 'producto_id', 'cantidad'], values: [['1', '1', '3']] },
    };
    const report = await copyRows(
      { has: (name) => name in pages, fetch: (name, offset) => (offset === 0 ? pages[name] : { columns: [], values: [] }), cell: postgresCell },
      p,
      100,
    );
    expect(report).toMatchObject({ tables: 4, rows: 5, truncated: [] });
    const schema = buildSchema(p);
    const cliente = schema.tables.find((t) => t.name === 'tienda_cliente')!;
    const row = p.records![cliente.id][0].values;
    const value = (name: string) => row[cliente.columns.find((c) => c.name === name)!.id];
    expect([value('activo'), value('foto')]).toEqual(['true', '0xcafe']);
    expect(validateRecords(p, schema).total).toBe(0);
  });
});
