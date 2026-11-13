import { describe, expect, it } from 'vitest';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { validateProject } from './validation';

const table = (schema: ReturnType<typeof buildSchema>, name: string) => {
  const found = schema.tables.find((t) => t.name === name);
  if (!found) throw new Error(`table ${name} missing`);
  return found;
};
const colNames = (t: { columns: { name: string }[] }) => t.columns.map((c) => c.name);
const pkNames = (t: ReturnType<typeof table>) =>
  (t.pk?.columnIds ?? []).map((id) => t.columns.find((c) => c.id === id)!.name);

describe('binary relationships', () => {
  it('1:N puts the FK on the N side', () => {
    const b = makeProject();
    const cliente = b.entity('cliente', ['nombre']);
    const pedido = b.entity('pedido', ['fecha']);
    b.relate([cliente, pedido], '1:N');
    const schema = buildSchema(b.project);

    expect(colNames(table(schema, 'pedido'))).toEqual(['id', 'fecha', 'cliente_id']);
    expect(colNames(table(schema, 'cliente'))).toEqual(['id', 'nombre']);
    const [fk] = schema.foreignKeys;
    expect(fk.name).toBe('fk_pedido_cliente');
    expect(fk.tableId).toBe(pedido.id);
    expect(fk.refTableId).toBe(cliente.id);
    expect(fk.holderEnd).toBe('many');
    expect(fk.refEnd).toBe('one');
  });

  it('1:1 adds a UNIQUE constraint on the FK', () => {
    const b = makeProject();
    const persona = b.entity('persona');
    const pasaporte = b.entity('pasaporte');
    b.relate([persona, pasaporte], '1:1');
    const t = table(buildSchema(b.project), 'pasaporte');
    expect(t.uniques).toHaveLength(1);
    expect(t.uniques[0].name).toBe('uq_pasaporte_persona_id');
  });

  it('optional parent makes the FK nullable', () => {
    const b = makeProject();
    const a = b.entity('depto');
    const e = b.entity('empleado');
    const rel = b.relate([a, e], '1:N');
    rel.participants[0].optional = true;
    const fkCol = table(buildSchema(b.project), 'empleado').columns.find((c) => c.origin === 'fk')!;
    expect(fkCol.nullable).toBe(true);
  });

  it('identifying relationship adds the FK to the child PK (weak entity)', () => {
    const b = makeProject();
    const factura = b.entity('factura');
    const linea = b.entity('linea');
    linea.attributes[0].name = 'numero';
    linea.attributes[0].autoIncrement = false;
    const rel = b.relate([factura, linea], '1:N');
    rel.identifying = true;
    const t = table(buildSchema(b.project), 'linea');
    expect(pkNames(t)).toEqual(['factura_id', 'numero']);
  });

  it('propagates composite PKs through chains of identifying relationships', () => {
    const b = makeProject();
    const a = b.entity('a');
    const c = b.entity('c');
    const d = b.entity('d');
    const r1 = b.relate([a, c], '1:N');
    r1.identifying = true;
    b.relate([c, d], '1:N');
    const t = table(buildSchema(b.project), 'd');
    expect(colNames(t)).toEqual(['id', 'c_a_id', 'c_id']);
  });

  it('serial PKs become plain integers in the FK column', () => {
    const b = makeProject('postgresql');
    const a = b.entity('autor');
    a.attributes[0].type = 'BIGSERIAL';
    a.attributes[0].autoIncrement = false;
    const l = b.entity('libro');
    b.relate([a, l], '1:N');
    const fkCol = table(buildSchema(b.project), 'libro').columns.find((c) => c.origin === 'fk')!;
    expect(fkCol.type).toBe('BIGINT');
    expect(fkCol.autoIncrement).toBe(false);
  });
});

describe('N:M and junction tables', () => {
  it('creates a junction named a_b with composite PK pk_a_b', () => {
    const b = makeProject();
    const alumno = b.entity('alumno');
    const curso = b.entity('curso');
    b.relate([alumno, curso], 'N:M');

    expect(b.project.entities.map((e) => e.name)).toEqual(['alumno', 'curso', 'alumno_curso']);
    const t = table(buildSchema(b.project), 'alumno_curso');
    expect(t.kind).toBe('junction');
    expect(colNames(t)).toEqual(['alumno_id', 'curso_id']);
    expect(pkNames(t)).toEqual(['alumno_id', 'curso_id']);
    expect(t.pk?.name).toBe('pk_alumno_curso');
    expect(t.foreignKeys).toHaveLength(2);
  });

  it('keeps a custom junction name when entities are renamed', () => {
    const b = makeProject();
    const alumno = b.entity('alumno');
    const curso = b.entity('curso');
    const rel = b.relate([alumno, curso], 'N:M');
    const junction = b.project.entities.find((e) => e.id === rel.junctionId)!;
    junction.name = 'inscripcion';
    junction.nameIsCustom = true;
    alumno.name = 'estudiante';
    b.sync();
    expect(junction.name).toBe('inscripcion');

    junction.nameIsCustom = false;
    b.sync();
    expect(junction.name).toBe('estudiante_curso');
  });

  it('extends the composite PK with own attributes marked as PK', () => {
    const b = makeProject();
    const rel = b.relate([b.entity('medico'), b.entity('paciente')], 'N:M');
    const junction = b.project.entities.find((e) => e.id === rel.junctionId)!;
    junction.attributes.push(createAttribute('postgresql', { name: 'fecha', type: 'DATE', pk: true, nullable: false }));
    junction.attributes.push(createAttribute('postgresql', { name: 'motivo' }));
    const t = table(buildSchema(b.project), 'medico_paciente');
    expect(pkNames(t)).toEqual(['medico_id', 'paciente_id', 'fecha']);
    expect(colNames(t)).toEqual(['fecha', 'medico_id', 'paciente_id', 'motivo']);
  });

  it('surrogate PK mode uses the own PK and keeps UNIQUE on the FKs', () => {
    const b = makeProject();
    const rel = b.relate([b.entity('producto'), b.entity('pedido')], 'N:M');
    const junction = b.project.entities.find((e) => e.id === rel.junctionId)!;
    junction.junction!.pkMode = 'surrogate';
    junction.attributes.push(createAttribute('postgresql', { name: 'id', type: 'INTEGER', pk: true, autoIncrement: true }));
    const t = table(buildSchema(b.project), 'producto_pedido');
    expect(pkNames(t)).toEqual(['id']);
    expect(t.uniques.map((u) => u.name)).toEqual(['uq_producto_pedido_producto_id_pedido_id']);
    expect(t.columns.filter((c) => c.origin === 'fk').every((c) => !c.nullable)).toBe(true);

    junction.junction!.keepUniqueOnFks = false;
    expect(table(buildSchema(b.project), 'producto_pedido').uniques).toHaveLength(0);
  });

  it('surrogate mode without a PK attribute reports an error', () => {
    const b = makeProject();
    const rel = b.relate([b.entity('x'), b.entity('y')], 'N:M');
    b.project.entities.find((e) => e.id === rel.junctionId)!.junction!.pkMode = 'surrogate';
    const issues = buildSchema(b.project).issues;
    expect(issues.some((i) => i.level === 'error' && i.message.includes('PK propia'))).toBe(true);
  });

  it('removes the junction when the relationship becomes 1:N', () => {
    const b = makeProject();
    const rel = b.relate([b.entity('a'), b.entity('b')], 'N:M');
    expect(b.project.entities).toHaveLength(3);
    rel.participants[0].cardinality = '1';
    b.sync();
    expect(b.project.entities).toHaveLength(2);
    expect(rel.junctionId).toBeUndefined();
  });

  it('removes relationship and junction when a participant entity is deleted', () => {
    const b = makeProject();
    const a = b.entity('a');
    b.relate([a, b.entity('b')], 'N:M');
    b.project.entities = b.project.entities.filter((e) => e.id !== a.id);
    b.sync();
    expect(b.project.relationships).toHaveLength(0);
    expect(b.project.entities.map((e) => e.name)).toEqual(['b']);
  });
});

describe('ternary relationships', () => {
  it('N:N:N creates a junction with three FKs, all in the PK', () => {
    const b = makeProject();
    b.relate([b.entity('proveedor'), b.entity('pieza'), b.entity('proyecto')]);
    const t = table(buildSchema(b.project), 'proveedor_pieza_proyecto');
    expect(t.arity).toBe(3);
    expect(t.foreignKeys).toHaveLength(3);
    expect(pkNames(t)).toEqual(['proveedor_id', 'pieza_id', 'proyecto_id']);
  });

  it('a participant with cardinality 1 is left out of the default key', () => {
    const b = makeProject();
    const rel = b.relate([b.entity('tecnico'), b.entity('proyecto'), b.entity('cuaderno')]);
    rel.participants[2].cardinality = '1';
    const t = table(buildSchema(b.project), 'tecnico_proyecto_cuaderno');
    expect(pkNames(t)).toEqual(['tecnico_id', 'proyecto_id']);
    expect(t.columns.find((c) => c.name === 'cuaderno_id')?.nullable).toBe(false);
  });
});

describe('recursive relationships', () => {
  it('1:N recursive creates a self FK named after the role', () => {
    const b = makeProject();
    const empleado = b.entity('empleado');
    const rel = b.relate([empleado, empleado], '1:N');
    rel.participants[0].role = 'jefe';
    rel.participants[1].role = 'subordinado';
    const schema = buildSchema(b.project);
    const t = table(schema, 'empleado');
    expect(colNames(t)).toEqual(['id', 'jefe_id']);
    expect(t.columns[1].nullable).toBe(true);
    expect(schema.foreignKeys[0].refTableId).toBe(empleado.id);
    expect(schema.foreignKeys[0].name).toBe('fk_empleado_jefe');
  });

  it('N:M recursive creates a junction with two FKs to the same table', () => {
    const b = makeProject();
    const usuario = b.entity('usuario');
    const rel = b.relate([usuario, usuario], 'N:M');
    rel.participants[0].role = 'seguidor';
    rel.participants[1].role = 'seguido';
    b.sync();
    const t = table(buildSchema(b.project), 'seguidor_seguido');
    expect(colNames(t)).toEqual(['seguidor_id', 'seguido_id']);
    expect(t.foreignKeys.every((fk) => fk.refTableId === usuario.id)).toBe(true);
  });

  it('flags missing or repeated roles', () => {
    const b = makeProject();
    const p = b.entity('persona');
    const rel = b.relate([p, p], 'N:M');
    rel.participants[0].role = 'x';
    rel.participants[1].role = 'x';
    const issues = validateProject(b.project, buildSchema(b.project));
    expect(issues.some((i) => i.message.includes('deben ser distintos'))).toBe(true);
  });
});

describe('indexes', () => {
  it('names indexes by default and resolves FK columns', () => {
    const b = makeProject();
    const cliente = b.entity('cliente');
    const pedido = b.entity('pedido', ['fecha']);
    const rel = b.relate([cliente, pedido], '1:N');
    const fecha = pedido.attributes[1];
    pedido.indexes.push({
      id: 'i1',
      name: '',
      nameIsCustom: false,
      unique: false,
      columns: [
        { columnId: `fk:${rel.id}:${rel.participants[0].id}:${cliente.attributes[0].id}`, order: 'ASC' },
        { columnId: fecha.id, order: 'DESC' },
      ],
    });
    const t = table(buildSchema(b.project), 'pedido');
    expect(t.indexes[0].name).toBe('idx_pedido_cliente_id_fecha');
    expect(t.indexes[0].columns).toHaveLength(2);
  });

  it('drops columns that no longer exist and warns', () => {
    const b = makeProject();
    const e = b.entity('e');
    e.indexes.push({ id: 'i', name: 'mi_idx', nameIsCustom: true, unique: true, columns: [{ columnId: 'gone', order: 'ASC' }] });
    const schema = buildSchema(b.project);
    expect(table(schema, 'e').indexes[0].columns).toHaveLength(0);
    expect(schema.issues.some((i) => i.message.includes('ya no existen'))).toBe(true);
  });

  it('warns about duplicate and PK-redundant indexes', () => {
    const b = makeProject();
    const e = b.entity('e', ['a']);
    const [id, a] = e.attributes;
    const idx = (n: string, col: string) => ({ id: n, name: n, nameIsCustom: true, unique: false, columns: [{ columnId: col, order: 'ASC' as const }] });
    e.indexes.push(idx('i1', a.id), idx('i2', a.id), idx('i3', id.id));
    const issues = validateProject(b.project, buildSchema(b.project));
    expect(issues.some((i) => i.message.includes('mismas columnas'))).toBe(true);
    expect(issues.some((i) => i.message.includes('redundante'))).toBe(true);
  });
});

describe('FK to a unique attribute', () => {
  it('points to the attribute and copies its type', () => {
    const b = makeProject('postgresql');
    const cliente = b.entity('cliente');
    const email = createAttribute('postgresql', { name: 'email', type: 'VARCHAR', length: 160, unique: true, nullable: false });
    cliente.attributes.push(email);
    const pedido = b.entity('pedido');
    const rel = b.relate([cliente, pedido], '1:N');
    rel.participants[0].refAttributeId = email.id;
    const schema = buildSchema(b.project);
    const fk = schema.foreignKeys[0];
    const column = schema.tables.find((t) => t.id === pedido.id)!.columns.find((c) => c.id === fk.columnIds[0])!;
    expect(fk.refColumnIds).toEqual([email.id]);
    expect(column).toMatchObject({ name: 'cliente_email', type: 'VARCHAR', length: 160 });
  });

  it('reports an error when the attribute is not unique', () => {
    const b = makeProject('postgresql');
    const cliente = b.entity('cliente');
    const nombre = createAttribute('postgresql', { name: 'nombre' });
    cliente.attributes.push(nombre);
    const rel = b.relate([cliente, b.entity('pedido')], '1:N');
    rel.participants[0].refAttributeId = nombre.id;
    const issues = validateProject(b.project, buildSchema(b.project));
    expect(issues.some((i) => i.level === 'error' && i.message.includes('no es UNIQUE'))).toBe(true);
  });
});
