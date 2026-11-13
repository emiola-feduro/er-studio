import { describe, expect, it } from 'vitest';
import { reviewDesign, type ReviewRule } from './design-review';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import type { DialectId } from './types';

const attr = (name: string, type = 'VARCHAR', extra = {}) => createAttribute('postgresql', { name, type, length: type === 'VARCHAR' ? 80 : undefined, ...extra });
const rules = (project: ReturnType<typeof makeProject>['project']) => reviewDesign(project, buildSchema(project));
const byRule = (project: ReturnType<typeof makeProject>['project'], rule: ReviewRule) => rules(project).filter((f) => f.rule === rule);

describe('reviewDesign', () => {
  it('finds FKs without an index, except in MySQL and when an index covers them', () => {
    const b = makeProject('postgresql');
    const clientes = b.entity('clientes');
    const pedidos = b.entity('pedidos');
    b.relate([clientes, pedidos], '1:N');
    const found = byRule(b.project, 'fkWithoutIndex');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ params: { table: 'pedidos', columns: 'cliente_id', ref: 'clientes' }, fix: { kind: 'createIndex' } });
    const fkColumn = buildSchema(b.project).tables.find((t) => t.name === 'pedidos')!.columns.find((c) => c.name === 'cliente_id')!;
    pedidos.indexes.push({ id: 'i', name: '', nameIsCustom: false, unique: false, columns: [{ columnId: fkColumn.id, order: 'ASC' }] });
    expect(byRule(b.project, 'fkWithoutIndex')).toEqual([]);
    const mysql = makeProject('mysql' as DialectId);
    mysql.relate([mysql.entity('a'), mysql.entity('b')], '1:N');
    expect(byRule(mysql.project, 'fkWithoutIndex')).toEqual([]);
  });

  it('does not ask for an index on junction keys covered by the composite PK prefix', () => {
    const b = makeProject('postgresql');
    b.relate([b.entity('pedidos'), b.entity('productos')], 'N:M');
    const found = byRule(b.project, 'fkWithoutIndex');
    expect(found.map((f) => f.params.columns)).toEqual(['producto_id']);
  });

  it('suggests a natural key and offers to make the likely column unique', () => {
    const b = makeProject('postgresql');
    const clientes = b.entity('clientes');
    clientes.attributes.push(attr('nombre'), attr('email'));
    const [finding] = byRule(b.project, 'noNaturalKey');
    expect(finding).toMatchObject({ params: { table: 'clientes', pk: 'id', candidate: 'email' }, fix: { kind: 'makeUnique', attributeId: clientes.attributes[2].id } });
    clientes.attributes[2].unique = true;
    expect(byRule(b.project, 'noNaturalKey')).toEqual([]);
  });

  it('finds repeated groups of columns across tables', () => {
    const b = makeProject('postgresql');
    b.entity('clientes').attributes.push(attr('nombre'), attr('direccion'), attr('ciudad'), attr('pais'));
    b.entity('proveedores').attributes.push(attr('nombre'), attr('direccion'), attr('ciudad'), attr('pais'));
    const [finding] = byRule(b.project, 'repeatedColumns');
    expect(finding.params).toEqual({ columns: 'ciudad, direccion, pais', tables: 'clientes, proveedores' });
  });

  it('finds 1NF problems: numbered columns and list columns', () => {
    const b = makeProject('postgresql');
    b.entity('clientes').attributes.push(attr('telefono1'), attr('telefono2'), attr('telefono_3'), attr('tags', 'TEXT'), attr('notas', 'TEXT'));
    expect(byRule(b.project, 'repeatingGroup')[0].params.columns).toBe('telefono1, telefono2, telefono_3');
    expect(byRule(b.project, 'multiValued').map((f) => f.params.column)).toEqual(['tags']);
  });

  it('finds a column that copies the referenced table (3NF)', () => {
    const b = makeProject('postgresql');
    const clientes = b.entity('clientes');
    clientes.attributes.push(attr('nombre'));
    const pedidos = b.entity('pedidos');
    pedidos.attributes.push(attr('cliente_nombre'));
    b.relate([clientes, pedidos], '1:N');
    expect(byRule(b.project, 'redundantColumn')[0].params).toMatchObject({ table: 'pedidos', column: 'cliente_nombre', ref: 'clientes', refColumn: 'nombre', fk: 'cliente_id' });
  });

  it('finds a partial dependency in a composite key table (2NF)', () => {
    const b = makeProject('postgresql');
    const productos = b.entity('productos');
    productos.attributes.push(attr('precio', 'NUMERIC'));
    const rel = b.relate([b.entity('pedidos'), productos], 'N:M');
    b.project.entities.find((e) => e.id === rel.junctionId)!.attributes.push(attr('precio', 'NUMERIC'), attr('cantidad', 'INTEGER'));
    expect(byRule(b.project, 'partialDependency').map((f) => f.params)).toEqual([{ table: 'pedidos_productos', column: 'precio', ref: 'productos' }]);
  });

  it('flags very wide tables', () => {
    const b = makeProject('postgresql');
    const wide = b.entity('wide');
    for (let i = 0; i < 26; i += 1) wide.attributes.push(attr(`campo_${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}x`));
    expect(byRule(b.project, 'wideTable')).toHaveLength(1);
  });
});
