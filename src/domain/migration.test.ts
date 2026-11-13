import { describe, expect, it } from 'vitest';
import { createSampleProject } from '../lib/sample-project';
import { buildSchema } from './inference';
import { diffSchemas } from './migration';
import { createAttribute, createEntity, createRelationship, syncJunctions } from './model';
import type { DialectId, Project } from './types';

const versions = (dialect: DialectId = 'postgresql') => {
  const before = createSampleProject();
  before.dialect = dialect;
  const after: Project = structuredClone(before);
  const entity = (p: Project, name: string) => p.entities.find((e) => e.name === name)!;
  // Rename a table and a column, add and drop columns, change a type and NOT NULL.
  entity(after, 'cliente').name = 'clientes';
  const email = entity(after, 'clientes').attributes.find((a) => a.name === 'email')!;
  email.name = 'correo';
  entity(after, 'clientes').attributes.push(createAttribute(dialect, { name: 'telefono', type: 'VARCHAR', length: 20 }));
  const pedido = entity(after, 'pedido');
  pedido.attributes = pedido.attributes.filter((a) => a.name !== 'estado');
  const nombre = entity(after, 'producto').attributes.find((a) => a.name === 'nombre')!;
  nombre.length = 200;
  nombre.nullable = true;
  // A new related table with an index; drop another table.
  const categorias = createEntity(dialect, 'categorias', { x: 0, y: 0 });
  categorias.attributes.push(createAttribute(dialect, { name: 'nombre', type: 'VARCHAR', length: 60, nullable: false }));
  after.entities.push(categorias);
  after.relationships.push(createRelationship([categorias.id, entity(after, 'producto').id], '1:N'));
  categorias.indexes.push({ id: 'idx-cat', name: '', nameIsCustom: false, unique: true, columns: [{ columnId: categorias.attributes[1].id, order: 'ASC' }] });
  const empleado = entity(after, 'empleado');
  after.relationships = after.relationships.filter((r) => !r.participants.some((p) => p.entityId === empleado.id));
  after.entities = after.entities.filter((e) => e.id !== empleado.id);
  syncJunctions(after);
  return { before, after };
};

const migrate = (dialect: DialectId) => {
  const { before, after } = versions(dialect);
  return diffSchemas(buildSchema(before), buildSchema(after), dialect, { from: 'v1', to: 'v2' });
};

describe('diffSchemas', () => {
  it('writes ALTER statements for PostgreSQL in a safe order', () => {
    const { sql, changes } = migrate('postgresql');
    expect(sql).toContain('ALTER TABLE cliente RENAME TO clientes;');
    expect(sql).toContain('ALTER TABLE clientes RENAME COLUMN email TO correo;');
    expect(sql).toContain('ALTER TABLE clientes ADD COLUMN telefono VARCHAR(20);');
    expect(sql).toContain('-- ATENCIÓN: borra datos\nALTER TABLE pedido DROP COLUMN estado;');
    expect(sql).toContain('ALTER TABLE producto ALTER COLUMN nombre TYPE VARCHAR(200) USING nombre::VARCHAR(200);');
    expect(sql).toContain('ALTER TABLE producto ALTER COLUMN nombre DROP NOT NULL;');
    expect(sql).toContain('CREATE TABLE categorias (');
    expect(sql).toContain('ADD CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id)');
    expect(sql).toContain('ALTER TABLE producto ADD COLUMN categoria_id INTEGER NOT NULL;');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_categorias_nombre ON categorias (nombre);');
    expect(sql).toContain('DROP TABLE empleado;');
    expect(sql).toContain('ALTER TABLE cliente DROP CONSTRAINT uq_cliente_email;');
    expect(sql).not.toContain('DROP CONSTRAINT fk_pedido_cliente');
    expect(sql).toContain('ALTER TABLE clientes ADD CONSTRAINT uq_clientes_correo UNIQUE (correo);');
    // Constraints are dropped before tables are renamed and FKs added at the end.
    expect(sql.indexOf('DROP CONSTRAINT uq_cliente_email')).toBeLessThan(sql.indexOf('RENAME TO clientes'));
    expect(sql.indexOf('CREATE TABLE categorias')).toBeLessThan(sql.indexOf('ADD CONSTRAINT fk_producto_categoria'));
    expect(changes.filter((c) => c.destructive).map((c) => c.kind).sort()).toEqual(['dropColumn', 'dropTable']);
  });

  it('uses each gestor syntax', () => {
    const mysql = migrate('mysql').sql;
    expect(mysql).toContain('ALTER TABLE producto MODIFY COLUMN nombre VARCHAR(200);');
    expect(mysql).toContain('ALTER TABLE cliente DROP INDEX uq_cliente_email;');
    const sqlserver = migrate('sqlserver').sql;
    expect(sqlserver).toContain("EXEC sp_rename 'cliente', 'clientes';");
    expect(sqlserver).toContain("EXEC sp_rename 'clientes.email', 'correo', 'COLUMN';");
    expect(sqlserver).toContain('ALTER TABLE clientes ADD telefono VARCHAR(20);');
    expect(sqlserver).toContain('ALTER TABLE producto ALTER COLUMN nombre VARCHAR(200) NULL;');
    const oracle = migrate('oracle').sql;
    expect(oracle).toContain('ALTER TABLE clientes ADD (telefono VARCHAR(20));');
    expect(oracle).toContain('ALTER TABLE producto MODIFY (nombre VARCHAR(200) NULL);');
  });

  it('rebuilds SQLite tables it cannot alter and copies their data', () => {
    const { sql, changes } = migrate('sqlite');
    expect(sql.startsWith('-- Migración de v1 a v2')).toBe(true);
    expect(sql).toContain('PRAGMA foreign_keys = OFF;');
    expect(sql).toContain('CREATE TABLE producto__new (');
    expect(sql).toContain('INSERT INTO producto__new (id, nombre, precio)\n  SELECT id, nombre, precio FROM producto;');
    expect(sql).toContain('ALTER TABLE producto__new RENAME TO producto;');
    expect(sql.trimEnd().endsWith('PRAGMA foreign_keys = ON;')).toBe(true);
    expect(sql).toContain('INSERT INTO clientes__new (id, nombre, correo, creado_en)\n  SELECT id, nombre, email, creado_en FROM clientes;');
    expect(changes.some((c) => c.kind === 'rebuildTable' && c.table === 'producto')).toBe(true);
  });

  it('says when there is nothing to change', () => {
    const project = createSampleProject();
    const { sql, changes } = diffSchemas(buildSchema(project), buildSchema(structuredClone(project)), 'postgresql', { from: 'v1', to: 'v1' });
    expect(changes).toEqual([]);
    expect(sql).toContain('-- No hay cambios.');
  });
});
