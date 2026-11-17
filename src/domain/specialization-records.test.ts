import { describe, expect, it } from 'vitest';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { uid } from './model';
import { generateRows, seededRng } from './random-values';
import { validateRecords } from './records';
import { discriminatorAttrId } from './specialization';
import type { Project, Specialization, SpecializationMapping } from './types';

/** persona(id, nombre) with empleado(salario, required) and cliente(credito). */
const setup = (mapping: SpecializationMapping, patch: Partial<Specialization> = {}) => {
  const b = makeProject('postgresql');
  const persona = b.entity('persona', ['nombre']);
  const empleado = b.entity('empleado', ['salario']);
  empleado.attributes = empleado.attributes.filter((a) => !a.pk).map((a) => ({ ...a, nullable: false }));
  const cliente = b.entity('cliente', ['credito']);
  cliente.attributes = cliente.attributes.filter((a) => !a.pk);
  const spec: Specialization = { id: uid(), supertypeId: persona.id, subtypeIds: [empleado.id, cliente.id], total: false, disjoint: true, mapping, ...patch };
  const project: Project = { ...b.sync(), specializations: [spec], namesLocale: 'es', records: {} };
  return { project, persona, empleado, cliente, spec };
};

/** Generates rows for a table and stores them, the way the records view does. */
const fill = (project: Project, tableId: string, count: number, seed: number) => {
  const { rows } = generateRows(project, buildSchema(project), tableId, count, seededRng(seed), 'es');
  project.records![tableId] = [...(project.records![tableId] ?? []), ...rows.map((values) => ({ id: uid(), values }))];
  return rows;
};
const issues = (project: Project) => {
  const result = validateRecords(project, buildSchema(project));
  return [...result.cells.values()].flatMap((rows) => [...rows.values()].flatMap((cols) => [...cols.values()]));
};

describe('records of a table per type hierarchy', () => {
  it('random rows follow the discriminator and never put a row in two subclasses', () => {
    const { project, persona, empleado, cliente } = setup('table-per-type');
    const people = fill(project, persona.id, 30, 1);
    expect(people.some((r) => r[discriminatorAttrId(project.specializations![0].id)])).toBe(true);
    fill(project, empleado.id, 30, 2);
    fill(project, cliente.id, 30, 3);
    expect(issues(project)).toEqual([]);
    const emp = new Set(project.records![empleado.id].map((r) => Object.values(r.values)[0]));
    expect(project.records![cliente.id].some((r) => emp.has(Object.values(r.values)[0]))).toBe(false);
  });

  it('flags a row in two subclasses, a wrong discriminator and a missing subclass when total', () => {
    const { project, persona, empleado, cliente, spec } = setup('table-per-type', { total: true });
    const schema = buildSchema(project);
    const key = schema.tables.find((t) => t.id === persona.id)!.pk!.columnIds[0];
    const disc = discriminatorAttrId(spec.id);
    project.records![persona.id] = [
      { id: 'p1', values: { [key]: '1', [disc]: 'empleado' } },
      { id: 'p2', values: { [key]: '2', [disc]: 'cliente' } },
      { id: 'p3', values: { [key]: '3', [disc]: 'empleado' } },
    ];
    const subKey = (id: string) => schema.tables.find((t) => t.id === id)!.pk!.columnIds[0];
    const salario = schema.tables.find((t) => t.id === empleado.id)!.columns.find((c) => c.name === 'salario')!.id;
    project.records![empleado.id] = [{ id: 'e1', values: { [subKey(empleado.id)]: '1', [salario]: '10' } }];
    project.records![cliente.id] = [
      { id: 'c1', values: { [subKey(cliente.id)]: '1' } },
      { id: 'c3', values: { [subKey(cliente.id)]: '3' } },
    ];
    const messages = issues(project).join(' | ');
    expect(messages).toContain('ya está en empleado');
    expect(messages).toContain('el tipo dice "empleado", no "cliente"');
    expect(messages).toContain('falta este registro en alguna de empleado, cliente');
  });
});

describe('records of a single table hierarchy', () => {
  it('random rows fill only the columns of their subclass', () => {
    const { project, persona } = setup('single-table');
    fill(project, persona.id, 40, 4);
    expect(issues(project)).toEqual([]);
  });

  it('flags a value of another subclass and a required one missing', () => {
    const { project, persona, spec } = setup('single-table');
    const table = buildSchema(project).tables.find((t) => t.id === persona.id)!;
    const col = (name: string) => table.columns.find((c) => c.name === name)!.id;
    project.records![persona.id] = [
      { id: 'a', values: { [col('id')]: '1', [col('tipo')]: 'empleado', [col('credito')]: '5' } },
      { id: 'b', values: { [col('id')]: '2', [col('tipo')]: 'cliente', [col('credito')]: '5' } },
    ];
    const messages = issues(project).join(' | ');
    expect(messages).toContain('Solo los registros de cliente llevan este valor');
    expect(messages.match(/obligatorio|requerido|Falta/i)).not.toBeNull();
    expect(spec.disjoint).toBe(true);
  });

  it('overlapping and total: every random row has at least one flag on', () => {
    const { project, persona } = setup('single-table', { disjoint: false, total: true });
    fill(project, persona.id, 40, 5);
    expect(issues(project)).toEqual([]);
  });
});
