import { describe, expect, it } from 'vitest';
import { createSampleProject } from '../../lib/sample-project';
import { generateDdl } from '../ddl';
import { ddlType, DIALECT_LIST } from '../dialects';
import { buildSchema } from '../inference';
import { changeDialect } from '../model';
import { fillRandomRecords, generateRandomModel, THEMES } from '../random-model';
import { seededRng } from '../random-values';
import type { DialectId, Project, Schema } from '../types';
import { validateProject } from '../validation';
import { detectDialect, detectFormat, importSchema } from '.';

/** Comparable summary of a schema: tables, columns with type and nullability, keys and FKs. */
const shape = (schema: Schema, dialect: DialectId) =>
  schema.tables
    .map((t) => ({
      table: t.name,
      columns: t.columns.map((c) => `${c.name}:${ddlType(dialect, c)}:${c.nullable ? 'null' : 'notnull'}${c.pk ? ':pk' : ''}`).sort(),
      fks: t.foreignKeys
        .map((fk) => `${fk.columnIds.map((id) => t.columns.find((c) => c.id === id)?.name).join(',')}->${schema.tables.find((x) => x.id === fk.refTableId)?.name}`)
        .sort(),
      indexes: t.indexes.map((i) => i.name).sort(),
    }))
    .sort((a, b) => a.table.localeCompare(b.table));

const roundTrip = (project: Project) => {
  const schema = buildSchema(project);
  const ddl = generateDdl(schema, project.dialect).sql;
  const { project: imported, report } = importSchema(ddl, { name: 'x', namesLocale: project.namesLocale ?? 'es', dialect: project.dialect });
  return { before: shape(schema, project.dialect), after: shape(buildSchema(imported), project.dialect), imported, report, ddl };
};

describe('importSchema round trip', () => {
  it('rebuilds the sample store from its own DDL in every gestor', () => {
    for (const { id } of DIALECT_LIST) {
      // A real change of gestor converts the types too.
      const project = createSampleProject();
      changeDialect(project, id);
      const { before, after, imported } = roundTrip(project);
      expect(after, id).toEqual(before);
      expect(imported.entities.find((e) => e.name === 'pedido_producto')?.kind).toBe('junction');
    }
  });

  it('rebuilds every random theme in every gestor without warnings', () => {
    for (const theme of THEMES) {
      for (const { id } of DIALECT_LIST) {
        const project = generateRandomModel({ dialect: id, entityCount: 99, themeId: theme.id, rng: seededRng(3) });
        fillRandomRecords(project, 2, seededRng(1));
        const { before, after, imported } = roundTrip(project);
        expect(after, `${theme.id} ${id}`).toEqual(before);
        expect(validateProject(imported, buildSchema(imported)).filter((i) => i.level === 'error'), `${theme.id} ${id}`).toEqual([]);
      }
    }
  });
});

describe('SQL written by hand', () => {
  it('reads PostgreSQL with serial, enum types, inline references and partial indexes', () => {
    const sql = `
      CREATE TYPE estado_pedido AS ENUM ('nuevo', 'pagado');
      CREATE TABLE public.clientes (
        id serial PRIMARY KEY,
        email varchar(160) NOT NULL UNIQUE,
        creado timestamp with time zone DEFAULT now()
      );
      CREATE TABLE pedidos (
        id bigserial PRIMARY KEY,
        cliente_id integer NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        comprador integer REFERENCES clientes,
        estado estado_pedido NOT NULL DEFAULT 'nuevo',
        total numeric(10,2) CHECK (total >= 0)
      );
      CREATE INDEX idx_pedidos_abiertos ON pedidos (cliente_id) WHERE estado = 'nuevo';`;
    const { project, dialect, report } = importSchema(sql, { name: 'pg', namesLocale: 'es' });
    expect(dialect).toBe('postgresql');
    const schema = buildSchema(project);
    const pedidos = schema.tables.find((t) => t.name === 'pedidos')!;
    expect(pedidos.columns.map((c) => c.name)).toEqual(['id', 'estado', 'total', 'cliente_id', 'comprador']);
    expect(pedidos.columns.find((c) => c.name === 'estado')).toMatchObject({ type: 'ENUM', enumValues: ['nuevo', 'pagado'], defaultValue: "'nuevo'" });
    expect(pedidos.columns.find((c) => c.name === 'total')).toMatchObject({ precision: 10, scale: 2, check: 'total >= 0' });
    expect(pedidos.columns.find((c) => c.name === 'comprador')!.nullable).toBe(true);
    expect(schema.tables.find((t) => t.name === 'clientes')!.columns.find((c) => c.name === 'creado')).toMatchObject({ type: 'TIMESTAMPTZ', defaultValue: 'now()' });
    expect(pedidos.indexes[0]).toMatchObject({ name: 'idx_pedidos_abiertos', where: "estado = 'nuevo'" });
    expect(project.relationships.find((r) => r.onDelete === 'CASCADE')).toBeTruthy();
    expect(report.relationships).toBe(2);
  });

  it('reads MySQL with backticks, ENUM, AUTO_INCREMENT, inline keys and table options', () => {
    const sql = `
      CREATE DATABASE tienda; USE tienda;
      CREATE TABLE \`users\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`role\` enum('admin','user') NOT NULL DEFAULT 'user',
        \`name\` varchar(80) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_name\` (\`name\`),
        KEY \`idx_role\` (\`role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE posts (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        author int unsigned NOT NULL,
        CONSTRAINT fk_posts_author FOREIGN KEY (author) REFERENCES users (id)
      );`;
    expect(detectDialect(sql)).toBe('mysql');
    const { project } = importSchema(sql, { name: 'my', namesLocale: 'en' });
    expect(project.databaseName).toBe('tienda');
    const schema = buildSchema(project);
    const users = schema.tables.find((t) => t.name === 'users')!;
    expect(users.columns.find((c) => c.name === 'role')).toMatchObject({ type: 'ENUM', enumValues: ['admin', 'user'] });
    expect(users.columns.find((c) => c.name === 'name')!.unique).toBe(true);
    expect(users.indexes.map((i) => i.name)).toEqual(['idx_role']);
    const posts = schema.tables.find((t) => t.name === 'posts')!;
    expect(posts.columns.map((c) => c.name)).toEqual(['id', 'author']);
    expect(schema.foreignKeys.find((f) => f.tableId === posts.id)!.name).toBe('fk_posts_author');
  });

  it('reads SQL Server with brackets, IDENTITY and GO, and SQLite with inline AUTOINCREMENT', () => {
    const tsql = `CREATE TABLE [dbo].[Categorias] ([Id] INT IDENTITY(1,1) NOT NULL, [Nombre] NVARCHAR(100) NOT NULL, CONSTRAINT [PK_Categorias] PRIMARY KEY CLUSTERED ([Id]))
GO
CREATE TABLE [Productos] ([Id] INT IDENTITY(1,1) PRIMARY KEY, [CategoriaId] INT NOT NULL, [Descripcion] NVARCHAR(MAX) NULL)
GO
ALTER TABLE [Productos] ADD CONSTRAINT [FK_Productos_Categorias] FOREIGN KEY ([CategoriaId]) REFERENCES [Categorias] ([Id])
GO`;
    const ss = importSchema(tsql, { name: 'ss', namesLocale: 'es' });
    expect(ss.dialect).toBe('sqlserver');
    const productos = buildSchema(ss.project).tables.find((t) => t.name === 'Productos')!;
    expect(productos.columns.map((c) => `${c.name}:${c.type}`)).toEqual(['Id:INT', 'Descripcion:NVARCHAR(MAX)', 'CategoriaId:INT']);
    const lite = importSchema('CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT, b_id INTEGER REFERENCES b(id)); CREATE TABLE b (id INTEGER PRIMARY KEY);', { name: 'l', namesLocale: 'es' });
    expect(lite.dialect).toBe('sqlite');
    expect(buildSchema(lite.project).foreignKeys).toHaveLength(1);
  });
});

describe('DBML', () => {
  const dbml = `
    Project tienda { database_type: 'PostgreSQL' }
    Enum order_status { pending paid "on hold" }
    Table users as U {
      id integer [pk, increment]
      email varchar(160) [not null, unique, note: 'login']
      created_at timestamp [default: \`now()\`]
    }
    Table orders {
      id integer [pk, increment]
      user_id integer [not null, ref: > users.id]
      status order_status [not null, default: 'pending']
      indexes {
        (user_id, status) [name: 'idx_orders_user_status']
      }
    }
    Table products {
      id integer [pk]
      name varchar(100)
    }
    Table order_items {
      order_id integer [ref: > orders.id]
      product_id integer
      quantity int [not null, default: 1]
      indexes { (order_id, product_id) [pk] }
    }
    Ref: order_items.product_id > products.id [delete: cascade]
    Table tags { id int [pk] }
    Ref: products.id <> tags.id`;

  it('is detected and read into entities, junctions and relationships', () => {
    expect(detectFormat(dbml)).toBe('dbml');
    const { project, dialect, format } = importSchema(dbml, { name: 'dbml', namesLocale: 'en' });
    expect([format, dialect]).toEqual(['dbml', 'postgresql']);
    const schema = buildSchema(project);
    const names = schema.tables.map((t) => t.name).sort();
    expect(names).toEqual(['order_items', 'orders', 'products', 'products_tags', 'tags', 'users']);
    const items = schema.tables.find((t) => t.name === 'order_items')!;
    expect(project.entities.find((e) => e.name === 'order_items')!.kind).toBe('junction');
    expect(items.columns.map((c) => c.name)).toEqual(['order_id', 'product_id', 'quantity']);
    const orders = schema.tables.find((t) => t.name === 'orders')!;
    expect(orders.columns.find((c) => c.name === 'status')).toMatchObject({ type: 'ENUM', enumValues: ['pending', 'paid', 'on hold'], defaultValue: "'pending'" });
    expect(orders.indexes[0].name).toBe('idx_orders_user_status');
    expect(schema.tables.find((t) => t.name === 'users')!.columns.find((c) => c.name === 'created_at')!.defaultValue).toBe('now()');
  });
});

describe('names language', () => {
  const sql = (ref: string, col: string) => `CREATE TABLE ${ref} (id INT PRIMARY KEY); CREATE TABLE x (id INT PRIMARY KEY, ${col} INT REFERENCES ${ref}(id));`;

  it('is guessed from the FK column names so no roles are needed', () => {
    const en = importSchema(sql('customers', 'customer_id'), { name: 'en', fallbackLocale: 'es' }).project;
    expect(en.namesLocale).toBe('en');
    expect(en.relationships[0].participants.every((p) => !p.role)).toBe(true);
    expect(importSchema(sql('proveedores', 'proveedor_id'), { name: 'es', fallbackLocale: 'en' }).project.namesLocale).toBe('es');
  });

  it('falls back to the given language when nothing tells them apart', () => {
    expect(importSchema('CREATE TABLE a (id INT PRIMARY KEY);', { name: 'a', fallbackLocale: 'fr' }).project.namesLocale).toBe('fr');
  });
});

describe('subclasses written as tables', () => {
  it('turn into a specialization with its discriminator when the tables stay the same', () => {
    const sql = `
      CREATE TABLE persona (id INT PRIMARY KEY, nombre VARCHAR(80) NOT NULL, tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('empleado', 'cliente')));
      CREATE TABLE empleado (id INT PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE, salario NUMERIC(10,2) NOT NULL);
      CREATE TABLE cliente (id INT PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE, credito NUMERIC(10,2));`;
    const { project } = importSchema(sql, { name: 'herencia', fallbackLocale: 'es' });
    expect(project.specializations).toHaveLength(1);
    const spec = project.specializations![0];
    expect(spec).toMatchObject({ mapping: 'table-per-type', disjoint: true, total: true });
    expect(spec.discriminator?.name).toBe('tipo');
    const tables = buildSchema(project).tables.map((t) => `${t.name}(${t.columns.map((c) => c.name).join(',')})`).sort();
    expect(tables).toEqual(['cliente(id,credito)', 'empleado(id,salario)', 'persona(id,nombre,tipo)']);
  });

  it('stay 1:1 relationships when the subtable key has another name', () => {
    const sql = `
      CREATE TABLE persona (id INT PRIMARY KEY, nombre VARCHAR(80));
      CREATE TABLE empleado (persona_id INT PRIMARY KEY REFERENCES persona(id), salario NUMERIC(10,2));`;
    const { project } = importSchema(sql, { name: 'x', fallbackLocale: 'es' });
    expect(project.specializations ?? []).toHaveLength(0);
    expect(buildSchema(project).tables.find((t) => t.name === 'empleado')!.columns.map((c) => c.name)).toContain('persona_id');
  });
});
