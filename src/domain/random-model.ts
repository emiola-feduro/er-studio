import { sortTables } from './ddl';
import { DIALECTS, type Generic } from './dialects';
import { buildSchema } from './inference';
import { createAttribute, createEntity, createProject, createRelationship, syncJunctions, uid, type RelationshipPreset } from './model';
import { generateRows, type Rng } from './random-values';
import type { Locale } from '../i18n';
import { localName, tableName } from './random-model-names';
import type { Attribute, DialectId, Entity, Project } from './types';

type AttrSpec = {
  name: string;
  generic: Generic;
  length?: number;
  precision?: number;
  scale?: number;
  unique?: boolean;
  nullable?: boolean;
  enumValues?: string[];
  /** CHECK on the column itself; written with the column name once it is translated. */
  min?: '>= 0' | '> 0';
  /** Left out at random so two models of the same theme are not identical. */
  optional?: boolean;
};

type RelSpec = {
  from: string;
  to: string;
  preset: RelationshipPreset;
  roles?: [string, string];
  attributes?: AttrSpec[];
  name?: string;
};

export type ThemeSpec = { id: string; name: string; entities: Record<string, AttrSpec[]>; relationships: RelSpec[] };

const text = (name: string, length: number, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'varchar', length, ...extra });
const money = (name: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'decimal', precision: 10, scale: 2, min: '>= 0', ...extra });
const int = (name: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'int', ...extra });
const date = (name: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'date', ...extra });
const stamp = (name: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'datetime', ...extra });
const flag = (name: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'bool', ...extra });
const choice = (name: string, enumValues: string[], extra: Partial<AttrSpec> = {}): AttrSpec => ({ name, generic: 'enum', enumValues, ...extra });

const person = [text('nombre', 80), text('apellido', 80), text('email', 160, { unique: true }), text('telefono', 20, { nullable: true, optional: true })];

export const THEMES: ThemeSpec[] = [
  {
    id: 'tienda',
    name: 'Tienda',
    entities: {
      cliente: [...person, stamp('creado_en', { optional: true })],
      pedido: [date('fecha'), choice('estado', ['PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO']), money('total', { optional: true })],
      producto: [text('nombre', 120), text('sku', 20, { unique: true }), money('precio'), int('stock', { min: '>= 0', optional: true })],
      categoria: [text('nombre', 60, { unique: true }), text('descripcion', 255, { nullable: true, optional: true })],
      proveedor: [text('nombre', 120), text('email', 160, { unique: true }), text('pais', 60, { optional: true })],
      empleado: [...person.slice(0, 3), date('fecha_ingreso', { optional: true })],
      envio: [text('direccion', 200), text('ciudad', 80), date('fecha_envio', { nullable: true })],
    },
    relationships: [
      { from: 'cliente', to: 'pedido', preset: '1:N', name: 'realiza' },
      { from: 'pedido', to: 'producto', preset: 'N:M', name: 'detalle', attributes: [int('cantidad', { min: '> 0' }), money('precio_unitario')] },
      { from: 'categoria', to: 'producto', preset: '1:N', name: 'clasifica' },
      { from: 'proveedor', to: 'producto', preset: 'N:M', name: 'suministra', attributes: [money('costo', { optional: true })] },
      { from: 'empleado', to: 'pedido', preset: '1:N', name: 'atiende' },
      { from: 'pedido', to: 'envio', preset: '1:1', name: 'se_envia' },
      { from: 'empleado', to: 'empleado', preset: '1:N', roles: ['jefe', 'subordinado'], name: 'supervisa' },
    ],
  },
  {
    id: 'biblioteca',
    name: 'Biblioteca',
    entities: {
      socio: [...person, date('fecha_alta', { optional: true })],
      libro: [text('titulo', 200), text('isbn', 17, { unique: true }), int('anio_publicacion', { optional: true })],
      autor: [text('nombre', 80), text('apellido', 80), text('pais', 60, { nullable: true, optional: true })],
      editorial: [text('nombre', 120, { unique: true }), text('ciudad', 80, { optional: true })],
      ejemplar: [text('codigo', 20, { unique: true }), choice('estado', ['DISPONIBLE', 'PRESTADO', 'DANADO'])],
      prestamo: [date('fecha_prestamo'), date('fecha_devolucion', { nullable: true })],
      genero: [text('nombre', 60, { unique: true })],
    },
    relationships: [
      { from: 'autor', to: 'libro', preset: 'N:M', name: 'escribe' },
      { from: 'editorial', to: 'libro', preset: '1:N', name: 'publica' },
      { from: 'libro', to: 'ejemplar', preset: '1:N', name: 'tiene' },
      { from: 'socio', to: 'prestamo', preset: '1:N', name: 'solicita' },
      { from: 'ejemplar', to: 'prestamo', preset: '1:N', name: 'se_presta' },
      { from: 'genero', to: 'libro', preset: '1:N', name: 'agrupa' },
    ],
  },
  {
    id: 'universidad',
    name: 'Universidad',
    entities: {
      estudiante: [...person, date('fecha_nacimiento', { optional: true })],
      curso: [text('codigo', 12, { unique: true }), text('nombre', 120), int('creditos', { min: '> 0' })],
      profesor: [...person.slice(0, 3), choice('categoria', ['AUXILIAR', 'ASOCIADO', 'TITULAR'], { optional: true })],
      departamento: [text('nombre', 120, { unique: true }), text('edificio', 40, { optional: true })],
      aula: [text('codigo', 12, { unique: true }), int('capacidad', { min: '> 0' })],
      carrera: [text('nombre', 120, { unique: true }), int('duracion_semestres', { optional: true })],
    },
    relationships: [
      { from: 'estudiante', to: 'curso', preset: 'N:M', name: 'inscripcion', attributes: [text('periodo', 10), { name: 'nota', generic: 'decimal', precision: 4, scale: 2, nullable: true }] },
      { from: 'profesor', to: 'curso', preset: '1:N', name: 'dicta' },
      { from: 'departamento', to: 'profesor', preset: '1:N', name: 'adscribe' },
      { from: 'aula', to: 'curso', preset: '1:N', name: 'aloja' },
      { from: 'carrera', to: 'estudiante', preset: '1:N', name: 'cursa' },
      { from: 'departamento', to: 'carrera', preset: '1:N', name: 'ofrece' },
      { from: 'curso', to: 'curso', preset: 'N:M', roles: ['curso', 'requisito'], name: 'prerrequisito' },
    ],
  },
  {
    id: 'hospital',
    name: 'Hospital',
    entities: {
      paciente: [...person, date('fecha_nacimiento'), choice('grupo_sanguineo', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], { optional: true })],
      medico: [...person.slice(0, 3), text('licencia', 20, { unique: true })],
      especialidad: [text('nombre', 80, { unique: true })],
      cita: [stamp('fecha_hora'), choice('estado', ['PROGRAMADA', 'ATENDIDA', 'CANCELADA']), text('motivo', 255, { nullable: true, optional: true })],
      medicamento: [text('nombre', 120, { unique: true }), text('presentacion', 60, { optional: true })],
      habitacion: [text('numero', 10, { unique: true }), int('piso'), flag('disponible', { optional: true })],
    },
    relationships: [
      { from: 'especialidad', to: 'medico', preset: '1:N', name: 'agrupa' },
      { from: 'paciente', to: 'cita', preset: '1:N', name: 'agenda' },
      { from: 'medico', to: 'cita', preset: '1:N', name: 'atiende' },
      { from: 'cita', to: 'medicamento', preset: 'N:M', name: 'receta', attributes: [text('dosis', 60), int('dias', { optional: true })] },
      { from: 'habitacion', to: 'paciente', preset: '1:N', name: 'hospeda' },
    ],
  },
  {
    id: 'aerolinea',
    name: 'Aerolínea',
    entities: {
      aeropuerto: [text('codigo_iata', 3, { unique: true }), text('nombre', 120), text('ciudad', 80)],
      vuelo: [text('numero', 8), stamp('salida'), stamp('llegada'), choice('estado', ['PROGRAMADO', 'EN_VUELO', 'ATERRIZADO', 'CANCELADO'])],
      avion: [text('matricula', 10, { unique: true }), text('modelo', 60), int('capacidad', { min: '> 0' })],
      pasajero: [...person, text('pasaporte', 20, { unique: true })],
      reserva: [stamp('creada_en'), text('asiento', 4, { nullable: true }), choice('clase', ['ECONOMICA', 'EJECUTIVA', 'PRIMERA'])],
      tripulante: [...person.slice(0, 2), choice('cargo', ['PILOTO', 'COPILOTO', 'AUXILIAR'])],
    },
    relationships: [
      { from: 'aeropuerto', to: 'vuelo', preset: '1:N', roles: ['origen', ''], name: 'sale_de' },
      { from: 'aeropuerto', to: 'vuelo', preset: '1:N', roles: ['destino', ''], name: 'llega_a' },
      { from: 'avion', to: 'vuelo', preset: '1:N', name: 'opera' },
      { from: 'pasajero', to: 'reserva', preset: '1:N', name: 'hace' },
      { from: 'vuelo', to: 'reserva', preset: '1:N', name: 'incluye' },
      { from: 'vuelo', to: 'tripulante', preset: 'N:M', name: 'asignacion' },
    ],
  },
  {
    id: 'streaming',
    name: 'Streaming',
    entities: {
      usuario: [text('nombre', 80), text('email', 160, { unique: true }), date('fecha_registro')],
      plan: [text('nombre', 40, { unique: true }), money('precio_mensual'), int('pantallas', { optional: true })],
      suscripcion: [date('inicio'), date('fin', { nullable: true }), flag('activa')],
      pelicula: [text('titulo', 200), int('duracion_minutos', { min: '> 0' }), int('anio', { optional: true })],
      genero: [text('nombre', 60, { unique: true })],
      actor: [text('nombre', 80), text('apellido', 80), text('pais', 60, { nullable: true, optional: true })],
      resena: [choice('puntuacion', ['1', '2', '3', '4', '5']), text('comentario', 500, { nullable: true }), date('fecha')],
    },
    relationships: [
      { from: 'usuario', to: 'suscripcion', preset: '1:N', name: 'contrata' },
      { from: 'plan', to: 'suscripcion', preset: '1:N', name: 'define' },
      { from: 'pelicula', to: 'genero', preset: 'N:M', name: 'pertenece' },
      { from: 'pelicula', to: 'actor', preset: 'N:M', name: 'reparto', attributes: [text('personaje', 80)] },
      { from: 'usuario', to: 'resena', preset: '1:N', name: 'escribe' },
      { from: 'pelicula', to: 'resena', preset: '1:N', name: 'recibe' },
    ],
  },
];

export const MIN_ENTITIES = 2;
export const maxEntities = (themeId?: string) =>
  Math.max(...THEMES.filter((t) => !themeId || t.id === themeId).map((t) => Object.keys(t.entities).length));

const pick = <T,>(rng: Rng, list: readonly T[]) => list[Math.floor(rng() * list.length)];

const shuffle = <T,>(rng: Rng, list: readonly T[]) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Connected subset of the theme's entities, grown from a random start so the diagram has no islands. */
const connectedSubset = (theme: ThemeSpec, count: number, rng: Rng) => {
  const names = Object.keys(theme.entities);
  const chosen = new Set([pick(rng, names)]);
  while (chosen.size < Math.min(count, names.length)) {
    const frontier = shuffle(rng, theme.relationships)
      .flatMap((r) => [r.from, r.to].filter((n) => !chosen.has(n) && (chosen.has(r.from) || chosen.has(r.to))));
    chosen.add(frontier[0] ?? pick(rng, names.filter((n) => !chosen.has(n))));
  }
  return names.filter((n) => chosen.has(n));
};

const toAttribute = (dialect: DialectId, spec: AttrSpec, locale: Locale): Attribute => {
  const { generic, unique = false, nullable = false, min } = spec;
  const name = localName(locale, spec.name);
  const enumValues = spec.enumValues?.map((v) => localName(locale, v));
  const ref = DIALECTS[dialect].map[generic];
  const typed = generic === 'enum' ? { type: ref.type } : {
    type: ref.type,
    length: spec.length ?? ref.length,
    precision: spec.precision ?? ref.precision,
    scale: spec.scale ?? ref.scale,
  };
  return createAttribute(dialect, { name, ...typed, unique, nullable, enumValues, check: min ? `${name} ${min}` : undefined });
};

const attributesFor = (dialect: DialectId, specs: AttrSpec[], rng: Rng, locale: Locale) =>
  specs.filter((s) => !s.optional || rng() < 0.6).map((s) => toAttribute(dialect, s, locale));

export type RandomModelOptions = {
  dialect: DialectId;
  entityCount: number;
  themeId?: string;
  /** Language of table, column, relationship and ENUM names. */
  namesLocale?: Locale;
  rng?: Rng;
};

/** Theme name in the chosen language, used as the project name. */
export const themeName = (theme: ThemeSpec, locale: Locale) => localName(locale, theme.name);

export const generateRandomModel = ({ dialect, entityCount, themeId, namesLocale = 'es', rng = Math.random }: RandomModelOptions): Project => {
  const theme = THEMES.find((t) => t.id === themeId) ?? pick(rng, THEMES);
  const names = connectedSubset(theme, Math.max(MIN_ENTITIES, entityCount), rng);
  const project = createProject(themeName(theme, namesLocale), dialect);

  const byName = new Map<string, Entity>();
  for (const name of names) {
    const entity = createEntity(dialect, tableName(namesLocale, name), { x: 0, y: 0 });
    entity.attributes.push(...attributesFor(dialect, theme.entities[name], rng, namesLocale));
    byName.set(name, entity);
    project.entities.push(entity);
  }

  const junctionAttrs = new Map<string, Attribute[]>();
  for (const spec of theme.relationships) {
    const from = byName.get(spec.from);
    const to = byName.get(spec.to);
    if (!from || !to) continue;
    const rel = createRelationship([from.id, to.id], spec.preset);
    rel.name = spec.name && localName(namesLocale, spec.name);
    spec.roles?.forEach((role, i) => {
      if (role) rel.participants[i].role = localName(namesLocale, role);
    });
    // Tables are plural, so the referenced side gets its singular name as role: the FK reads cliente_id.
    const referenced = spec.preset === 'N:M' ? [0, 1] : [0];
    for (const i of referenced) {
      const participant = rel.participants[i];
      if (!participant.role) participant.role = localName(namesLocale, i === 0 ? spec.from : spec.to);
    }
    if (spec.preset === '1:N' && from.id !== to.id) rel.onDelete = 'CASCADE';
    project.relationships.push(rel);
    if (spec.attributes) junctionAttrs.set(rel.id, attributesFor(dialect, spec.attributes, rng, namesLocale));
  }

  syncJunctions(project);
  for (const rel of project.relationships) {
    const junction = project.entities.find((e) => e.id === rel.junctionId);
    if (junction) junction.attributes.push(...(junctionAttrs.get(rel.id) ?? []));
  }
  return project;
};

/**
 * Fills every table with `count` random rows, referenced tables first so foreign keys point to
 * rows that exist. Tables whose key is made only of foreign keys (junctions) get at most half of
 * the possible combinations, so keys do not repeat.
 */
export const fillRandomRecords = (project: Project, count: number, rng: Rng = Math.random, locale: Locale = 'es') => {
  const schema = buildSchema(project);
  project.records = {};
  for (const table of sortTables(schema.tables)) {
    const pkIds = table.pk?.columnIds ?? [];
    const keyFks = table.foreignKeys.filter((fk) => fk.columnIds.some((id) => pkIds.includes(id)));
    const onlyFks = pkIds.length > 0 && pkIds.every((id) => keyFks.some((fk) => fk.columnIds.includes(id)));
    const combos = onlyFks ? keyFks.reduce((n, fk) => n * (project.records![fk.refTableId]?.length ?? 0), 1) : Infinity;
    const rows = Math.min(count, Math.floor(combos / 2) || Math.min(1, combos));
    if (rows <= 0) continue;
    const generated = generateRows(project, schema, table.id, rows, rng, locale).rows;
    project.records[table.id] = generated.map((values) => ({ id: uid(), values }));
  }
  return project;
};
