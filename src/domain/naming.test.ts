import { describe, expect, it } from 'vitest';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { singularize } from './naming';

describe('singularize', () => {
  it('handles Spanish plurals', () => {
    const cases = { clientes: 'cliente', pedidos: 'pedido', categorias: 'categoria', ciudades: 'ciudad', profesores: 'profesor', aviones: 'avion', editoriales: 'editorial', nombres: 'nombre', luces: 'luz', canciones: 'cancion', especialidades: 'especialidad', usuarios: 'usuario', cliente: 'cliente', mes: 'mes', analisis: 'analisis' };
    for (const [plural, singular] of Object.entries(cases)) expect(singularize(plural, 'es'), plural).toBe(singular);
  });

  it('handles English plurals', () => {
    const cases = { customers: 'customer', categories: 'category', boxes: 'box', addresses: 'address', people: 'person', status: 'status', data: 'data', order_items: 'order_item', orderItems: 'orderItem', books: 'book', wolves: 'wolf', series: 'series', classes: 'class' };
    for (const [plural, singular] of Object.entries(cases)) expect(singularize(plural, 'en'), plural).toBe(singular);
  });

  it('handles French and Portuguese plurals', () => {
    expect(singularize('clients', 'fr')).toBe('client');
    expect(singularize('journaux', 'fr')).toBe('journal');
    expect(singularize('bureaux', 'fr')).toBe('bureau');
    expect(singularize('cours', 'fr')).toBe('cours');
    expect(singularize('opcoes', 'pt')).toBe('opcao');
    expect(singularize('animais', 'pt')).toBe('animal');
    expect(singularize('itens', 'pt')).toBe('item');
    expect(singularize('professores', 'pt')).toBe('professor');
    expect(singularize('clientes', 'pt')).toBe('cliente');
  });
});

describe('FK names', () => {
  it('use the singular of the referenced table plus _id', () => {
    const b = makeProject('postgresql');
    const clientes = b.entity('clientes');
    const pedidos = b.entity('pedidos');
    const productos = b.entity('productos');
    b.relate([clientes, pedidos], '1:N');
    b.relate([pedidos, productos], 'N:M');
    const schema = buildSchema(b.project);
    const columns = (name: string) => schema.tables.find((t) => t.name === name)!.columns.map((c) => c.name);
    expect(columns('pedidos')).toContain('cliente_id');
    expect(columns('pedidos_productos')).toEqual(['pedido_id', 'producto_id']);
    expect(schema.foreignKeys.map((f) => f.name)).toContain('fk_pedidos_cliente');
  });

  it('follow the names language of the project', () => {
    const b = makeProject('postgresql');
    b.project.namesLocale = 'en';
    b.relate([b.entity('categories'), b.entity('products')], '1:N');
    expect(buildSchema(b.project).tables.find((t) => t.name === 'products')!.columns.map((c) => c.name)).toContain('category_id');
  });
});
