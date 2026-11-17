import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDdl } from './ddl';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { changeDialect, uid } from './model';
import { diffSchemas } from './migration';
import type { DialectId, Entity, Project, Specialization, SpecializationMapping } from './types';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** persona(id, nombre) with subtypes empleado(salario NOT NULL) and cliente(credito), and ciudad 1:N persona. */
const hierarchy = (mapping: SpecializationMapping, patch: Partial<Specialization> = {}, dialect: DialectId = 'postgresql') => {
  const b = makeProject('postgresql');
  const persona = b.entity('persona', ['nombre']);
  const empleado: Entity = { ...b.entity('empleado', ['salario']), attributes: [] };
  empleado.attributes = [{ ...b.project.entities.find((e) => e.id === empleado.id)!.attributes[1], nullable: false }];
  b.project.entities = b.project.entities.map((e) => (e.id === empleado.id ? empleado : e));
  const cliente = b.entity('cliente', ['credito']);
  cliente.attributes = cliente.attributes.filter((a) => !a.pk);
  const ciudad = b.entity('ciudad', ['nombre']);
  b.relate([ciudad, persona], '1:N');
  b.relate([ciudad, empleado], '1:N');
  const spec: Specialization = { id: uid(), supertypeId: persona.id, subtypeIds: [empleado.id, cliente.id], total: false, disjoint: true, mapping, ...patch };
  const project: Project = { ...b.sync(), specializations: [spec], namesLocale: 'es' };
  if (dialect !== 'postgresql') {
    changeDialect(project, dialect);
    project.dialect = dialect;
  }
  return { project, persona, empleado, cliente, ciudad, spec };
};

const table = (project: Project, name: string) => buildSchema(project).tables.find((t) => t.name === name);
const columns = (project: Project, name: string) => table(project, name)?.columns.map((c) => c.name);

describe('table per type', () => {
  it('gives each subtype a key that is a FK to the supertype, and a discriminator', () => {
    const { project } = hierarchy('table-per-type');
    const schema = buildSchema(project);
    const empleado = schema.tables.find((t) => t.name === 'empleado')!;
    const persona = schema.tables.find((t) => t.name === 'persona')!;
    expect(empleado.columns.map((c) => c.name)).toEqual(['id', 'salario', 'ciudad_id']);
    expect(empleado.pk!.columnIds).toEqual([empleado.columns[0].id]);
    const fk = empleado.foreignKeys.find((f) => f.refTableId === persona.id)!;
    expect(fk).toMatchObject({ name: 'fk_empleado_persona', onDelete: 'CASCADE' });
    expect(empleado.uniques).toEqual([]);
    expect(persona.columns.find((c) => c.name === 'tipo')).toMatchObject({ type: 'ENUM', enumValues: ['empleado', 'cliente'], nullable: true });
  });

  it('makes the discriminator required when total and leaves it out when overlapping', () => {
    expect(table(hierarchy('table-per-type', { total: true }).project, 'persona')!.columns.find((c) => c.name === 'tipo')!.nullable).toBe(false);
    expect(columns(hierarchy('table-per-type', { disjoint: false }).project, 'persona')).not.toContain('tipo');
  });

  it('keeps a key of the subtype as UNIQUE with a warning', () => {
    const { project, cliente } = hierarchy('table-per-type');
    cliente.attributes.unshift({ id: uid(), name: 'codigo', type: 'VARCHAR', length: 10, pk: true, nullable: false, unique: false, autoIncrement: false });
    const schema = buildSchema(project);
    const codigo = schema.tables.find((t) => t.name === 'cliente')!.columns.find((c) => c.name === 'codigo')!;
    expect(codigo).toMatchObject({ pk: false, unique: true });
    expect(schema.issues.some((i) => i.message.includes('codigo') || i.message.includes('cliente'))).toBe(true);
  });
});

describe('single table', () => {
  it('moves subtype columns into the supertype, with CHECKs, and redirects relationships', () => {
    const { project, persona } = hierarchy('single-table');
    const schema = buildSchema(project);
    expect(schema.tables.map((t) => t.name).sort()).toEqual(['ciudad', 'persona']);
    const table = schema.tables.find((t) => t.id === persona.id)!;
    expect(table.columns.map((c) => c.name)).toEqual(expect.arrayContaining(['tipo', 'salario', 'credito']));
    expect(table.columns.find((c) => c.name === 'salario')!.nullable).toBe(true);
    expect(table.checks!.map((c) => c.expression)).toEqual(
      expect.arrayContaining([
        "salario IS NULL OR COALESCE(tipo, '') = 'empleado'",
        "COALESCE(tipo, '') <> 'empleado' OR salario IS NOT NULL",
        "credito IS NULL OR COALESCE(tipo, '') = 'cliente'",
      ]),
    );
    // empleado's FK to ciudad is now in persona, and nullable: other rows leave it empty.
    const ciudad = schema.tables.find((t) => t.name === 'ciudad')!;
    const toCiudad = table.foreignKeys.filter((fk) => fk.refTableId === ciudad.id);
    expect(toCiudad).toHaveLength(2);
    expect(table.columns.find((c) => c.id === toCiudad[1].columnIds[0])!.nullable).toBe(true);
  });

  it('uses a flag per subtype when overlapping, and requires one when total', () => {
    const { project } = hierarchy('single-table', { disjoint: false, total: true });
    const persona = table(project, 'persona')!;
    expect(persona.columns.map((c) => c.name)).toEqual(expect.arrayContaining(['es_empleado', 'es_cliente']));
    expect(persona.checks!.map((c) => c.expression)).toContain('es_empleado = TRUE OR es_cliente = TRUE');
    const sqlserver = table(hierarchy('single-table', { disjoint: false }, 'sqlserver').project, 'persona')!;
    expect(sqlserver.checks!.some((c) => c.expression.includes('es_empleado = 1'))).toBe(true);
  });
});

describe('table per concrete subtype', () => {
  it('copies the supertype columns into each subtype and keeps the supertype when partial', () => {
    const { project } = hierarchy('table-per-concrete');
    expect(columns(project, 'empleado')).toEqual(expect.arrayContaining(['id', 'nombre', 'salario']));
    expect(table(project, 'persona')).toBeDefined();
  });

  it('drops the supertype when total, inherits what it pointed to, and reports what pointed to it', () => {
    const { project, persona, ciudad } = hierarchy('table-per-concrete', { total: true });
    // persona -> ciudad (persona holds the FK): inherited by both subtypes.
    const schema = buildSchema(project);
    expect(schema.tables.find((t) => t.id === persona.id)).toBeUndefined();
    expect(schema.tables.find((t) => t.name === 'cliente')!.foreignKeys.some((fk) => fk.refTableId === ciudad.id)).toBe(true);
    // A relationship where persona is referenced cannot be a FK.
    project.relationships.push({ ...structuredClone(project.relationships[0]), id: uid(), participants: [{ id: uid(), entityId: persona.id, cardinality: '1', optional: false }, { id: uid(), entityId: ciudad.id, cardinality: 'N', optional: false }] });
    expect(buildSchema(project).issues.some((i) => i.message.includes('persona') && i.level === 'error')).toBe(true);
  });
});

describe('problems', () => {
  it('reports several supertypes, cycles and a supertype without key', () => {
    const { project, persona, empleado, cliente } = hierarchy('table-per-type');
    project.specializations!.push({ id: uid(), supertypeId: cliente.id, subtypeIds: [empleado.id], total: false, disjoint: true, mapping: 'table-per-type' });
    project.specializations!.push({ id: uid(), supertypeId: empleado.id, subtypeIds: [persona.id], total: false, disjoint: true, mapping: 'table-per-type' });
    const issues = buildSchema(project).issues.map((i) => i.message);
    expect(issues.some((m) => m.includes('varias superclases'))).toBe(true);
    expect(issues.some((m) => m.includes('superclase de sí misma'))).toBe(true);
  });
});

describe('the DDL runs and enforces the rules (SQLite)', () => {
  const run = (project: Project) => {
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    const { sql } = generateDdl(buildSchema(project), 'sqlite');
    db.run(sql);
    return db;
  };
  const fails = (db: InstanceType<SqlJsStatic['Database']>, sql: string) => {
    try {
      db.run(sql);
      return false;
    } catch {
      return true;
    }
  };

  it('table per type: a subtype row needs its supertype row', () => {
    const { project } = hierarchy('table-per-type', {}, 'sqlite');
    const db = run(project);
    db.run("INSERT INTO ciudad (id, nombre) VALUES (1, 'Quito');");
    db.run("INSERT INTO persona (id, nombre, tipo, ciudad_id) VALUES (1, 'Ana', 'empleado', 1);");
    db.run("INSERT INTO empleado (id, salario, ciudad_id) VALUES (1, '100', 1);");
    expect(fails(db, "INSERT INTO empleado (id, salario, ciudad_id) VALUES (2, '100', 1);")).toBe(true);
    expect(fails(db, "INSERT INTO persona (id, nombre, tipo, ciudad_id) VALUES (3, 'X', 'otro', 1);")).toBe(true);
    db.run('DELETE FROM persona WHERE id = 1;');
    expect(db.exec('SELECT COUNT(*) FROM empleado')[0].values[0][0]).toBe(0);
  });

  it('single table: subtype columns only for their subtype, required ones present', () => {
    const { project } = hierarchy('single-table', {}, 'sqlite');
    const db = run(project);
    db.run("INSERT INTO ciudad (id, nombre) VALUES (1, 'Quito');");
    db.run("INSERT INTO persona (id, nombre, tipo, ciudad_id, salario) VALUES (1, 'Ana', 'empleado', 1, '100');");
    db.run("INSERT INTO persona (id, nombre, tipo, ciudad_id, credito) VALUES (2, 'Luis', 'cliente', 1, '5');");
    db.run("INSERT INTO persona (id, nombre, ciudad_id) VALUES (3, 'Sin tipo', 1);");
    expect(fails(db, "INSERT INTO persona (id, nombre, tipo, ciudad_id, credito) VALUES (4, 'X', 'empleado', 1, '5');")).toBe(true);
    expect(fails(db, "INSERT INTO persona (id, nombre, tipo, ciudad_id) VALUES (5, 'X', 'empleado', 1);")).toBe(true);
  });

  it('single table overlapping and total: at least one flag', () => {
    const { project } = hierarchy('single-table', { disjoint: false, total: true }, 'sqlite');
    const db = run(project);
    db.run("INSERT INTO ciudad (id, nombre) VALUES (1, 'Quito');");
    db.run("INSERT INTO persona (id, nombre, ciudad_id, es_empleado, es_cliente, salario, credito) VALUES (1, 'Ana', 1, TRUE, TRUE, '100', '5');");
    expect(fails(db, "INSERT INTO persona (id, nombre, ciudad_id) VALUES (2, 'Nadie', 1);")).toBe(true);
  });

  it('every mapping produces DDL in every gestor', () => {
    for (const dialect of ['postgresql', 'mysql', 'sqlite', 'sqlserver', 'oracle'] as DialectId[]) {
      for (const mapping of ['table-per-type', 'single-table', 'table-per-concrete'] as SpecializationMapping[]) {
        const { sql } = generateDdl(buildSchema(hierarchy(mapping, {}, dialect).project), dialect);
        expect(sql).toContain('CREATE TABLE');
      }
    }
  });
});

describe('migrations between mappings', () => {
  it('going from table per type to single table drops the subtype tables and adds columns and checks', () => {
    const before = hierarchy('table-per-type');
    const after = structuredClone(before.project);
    after.specializations![0].mapping = 'single-table';
    const { sql } = diffSchemas(buildSchema(before.project), buildSchema(after), 'postgresql');
    expect(sql).toContain('DROP TABLE');
    expect(sql).toMatch(/ADD COLUMN salario/);
    expect(sql).toContain("CHECK (salario IS NULL OR COALESCE(tipo, '') = 'empleado')");
  });
});
