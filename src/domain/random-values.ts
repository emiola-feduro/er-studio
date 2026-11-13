import { getLocale, type Locale } from '../i18n';
import { DIALECTS, findType, isSerial, lengthLimit, type Generic } from './dialects';
import { nextAutoValue } from './records';
import type { Column, DataRow, DialectId, Project, Schema, Table } from './types';

export type Rng = () => number;

/** Small seeded generator so tests are reproducible. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const int = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T,>(rng: Rng, list: readonly T[]) => list[int(rng, 0, list.length - 1)];
const pad = (n: number, size = 2) => String(n).padStart(size, '0');

const FIRST = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Jorge', 'Lucía', 'Andrés', 'Valentina', 'Diego', 'Camila', 'Mateo'];
const LAST = ['García', 'Rodríguez', 'López', 'Martínez', 'Gómez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores'];
const CITIES = ['Bogotá', 'Madrid', 'Lima', 'Quito', 'Santiago', 'Ciudad de México', 'Buenos Aires', 'Montevideo'];

/** Sample data per language, so generated rows read naturally next to the column names. */
const DATA: Record<Locale, { first: string[]; last: string[]; cities: string[]; countries: string[]; words: string[]; statuses: string[]; domain: string; street: (n: number) => string }> = {
  es: {
    first: FIRST,
    last: LAST,
    cities: CITIES,
    countries: ['Colombia', 'España', 'Perú', 'Ecuador', 'Chile', 'México', 'Argentina', 'Uruguay'],
    words: ['mesa', 'azul', 'rápido', 'proyecto', 'cliente', 'norte', 'verde', 'datos', 'pedido', 'nube', 'claro', 'ruta'],
    statuses: ['activo', 'inactivo', 'pendiente'],
    domain: 'ejemplo.com',
    street: (n) => `Calle ${n}`,
  },
  en: {
    first: ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'James', 'Mia', 'Lucas', 'Grace', 'Henry', 'Chloe', 'Jack'],
    last: ['Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Davis', 'Clark', 'Lewis', 'Walker', 'Hall'],
    cities: ['London', 'New York', 'Toronto', 'Sydney', 'Dublin', 'Chicago', 'Boston', 'Seattle'],
    countries: ['United Kingdom', 'United States', 'Canada', 'Australia', 'Ireland', 'New Zealand'],
    words: ['table', 'blue', 'quick', 'project', 'river', 'north', 'green', 'data', 'order', 'cloud', 'bright', 'route'],
    statuses: ['active', 'inactive', 'pending'],
    domain: 'example.com',
    street: (n) => `${n} Main Street`,
  },
  fr: {
    first: ['Léa', 'Hugo', 'Chloé', 'Louis', 'Manon', 'Jules', 'Camille', 'Arthur', 'Inès', 'Gabriel', 'Zoé', 'Nathan'],
    last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau'],
    cities: ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Montréal', 'Bruxelles', 'Genève', 'Nantes'],
    countries: ['France', 'Belgique', 'Suisse', 'Canada', 'Luxembourg', 'Sénégal'],
    words: ['table', 'bleu', 'rapide', 'projet', 'rivière', 'nord', 'vert', 'données', 'commande', 'nuage', 'clair', 'route'],
    statuses: ['actif', 'inactif', 'en attente'],
    domain: 'exemple.com',
    street: (n) => `${n} rue de la Paix`,
  },
  pt: {
    first: ['Ana', 'João', 'Maria', 'Pedro', 'Beatriz', 'Lucas', 'Mariana', 'Gabriel', 'Laura', 'Rafael', 'Júlia', 'Miguel'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Lima', 'Carvalho'],
    cities: ['São Paulo', 'Lisboa', 'Rio de Janeiro', 'Porto', 'Salvador', 'Recife', 'Curitiba', 'Coimbra'],
    countries: ['Brasil', 'Portugal', 'Angola', 'Moçambique', 'Cabo Verde'],
    words: ['mesa', 'azul', 'rápido', 'projeto', 'rio', 'norte', 'verde', 'dados', 'pedido', 'nuvem', 'claro', 'rota'],
    statuses: ['ativo', 'inativo', 'pendente'],
    domain: 'exemplo.com',
    street: (n) => `Rua das Flores, ${n}`,
  },
};

const ascii = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Column name fragments in the four languages, used to guess what kind of text fits. */
const KEYS = {
  email: ['email', 'correo', 'mail', 'courriel'],
  last: ['apellido', 'last', 'sobrenome', 'surname'],
  first: ['nombre', 'name', 'first', 'nom', 'prenom', 'nome'],
  phone: ['telefono', 'phone', 'celular', 'movil', 'telephone', 'telefone'],
  city: ['ciudad', 'city', 'ville', 'cidade'],
  country: ['pais', 'country', 'pays'],
  address: ['direccion', 'address', 'adresse', 'endereco'],
  code: ['codigo', 'code', 'sku', 'ref', 'numero', 'number', 'matricula', 'registration', 'immatriculation', 'pasaporte', 'passport', 'passeport', 'passaporte', 'licen', 'isbn', 'asiento', 'seat', 'siege', 'assento'],
  status: ['estado', 'status', 'statut'],
  url: ['url', 'web', 'sitio', 'site'],
  long: ['descripcion', 'description', 'comentario', 'comment', 'commentaire', 'nota', 'note', 'detalle', 'detail', 'motivo', 'reason', 'motif', 'descricao'],
};

/** Plausible text guessed from the column name, so generated rows read naturally. */
const textFor = (rng: Rng, columnName: string, locale: Locale) => {
  const data = DATA[locale];
  const name = ascii(columnName);
  const has = (keys: string[]) => keys.some((k) => name.includes(k));
  const words = (count: number) => Array.from({ length: count }, () => pick(rng, data.words)).join(' ');
  if (has(KEYS.email)) return `${ascii(pick(rng, data.first))}.${ascii(pick(rng, data.last)).replace(/\s/g, '')}${int(rng, 1, 99)}@${data.domain}`;
  if (has(KEYS.last)) return pick(rng, data.last);
  if (has(KEYS.first)) return KEYS.first.includes(name) ? `${pick(rng, data.first)} ${pick(rng, data.last)}` : pick(rng, data.first);
  if (has(KEYS.phone)) return `3${int(rng, 0, 2)}${int(rng, 0, 9)} ${int(rng, 100, 999)} ${int(rng, 1000, 9999)}`;
  if (has(KEYS.city)) return pick(rng, data.cities);
  if (has(KEYS.country)) return pick(rng, data.countries);
  if (has(KEYS.address)) return data.street(int(rng, 1, 150));
  if (has(KEYS.code)) return `${columnName.slice(0, 3).toUpperCase()}-${int(rng, 1000, 9999)}`;
  if (has(KEYS.status)) return pick(rng, data.statuses);
  if (has(KEYS.url)) return `https://${data.domain}/${ascii(pick(rng, data.words))}`;
  if (has(KEYS.long)) return words(int(rng, 4, 8));
  return words(int(rng, 1, 3));
};

const randomDate = (rng: Rng) => `${int(rng, 2015, 2026)}-${pad(int(rng, 1, 12))}-${pad(int(rng, 1, 28))}`;
const randomTime = (rng: Rng) => `${pad(int(rng, 0, 23))}:${pad(int(rng, 0, 59))}:${pad(int(rng, 0, 59))}`;
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const hex = (rng: Rng, size: number) => Array.from({ length: size }, () => int(rng, 0, 15).toString(16)).join('');

/** Types the generator does not fill (complex or binary values). */
const UNSUPPORTED: Generic[] = ['json', 'xml', 'binary', 'varbinary', 'blob', 'interval'];

export const canRandomize = (dialect: DialectId, column: Pick<Column, 'type'>) => {
  const def = findType(DIALECTS[dialect], column.type);
  return Boolean(def) && !UNSUPPORTED.includes(def!.generic);
};

/** A random value that fits the column type, or null when the type is not supported. */
export const randomValue = (dialect: DialectId, column: Column, rng: Rng, locale: Locale = getLocale()): string | null => {
  const def = findType(DIALECTS[dialect], column.type);
  if (!def || UNSUPPORTED.includes(def.generic)) return null;
  if (def.integer || def.serial) {
    const max = def.generic === 'tinyint' ? 127 : def.generic === 'smallint' ? 30000 : 1000;
    return String(int(rng, 1, max));
  }
  switch (def.generic) {
    case 'enum': {
      const values = column.enumValues ?? [];
      return values.length ? pick(rng, values) : null;
    }
    case 'decimal': {
      const scale = column.scale ?? (column.precision == null ? 2 : 0);
      const intDigits = Math.min(4, (column.precision ?? 6) - scale);
      const whole = intDigits > 0 ? int(rng, 0, 10 ** intDigits - 1) : 0;
      return scale > 0 ? `${whole}.${String(int(rng, 0, 10 ** scale - 1)).padStart(scale, '0')}` : String(whole);
    }
    case 'real':
    case 'double':
    case 'money':
      return (int(rng, 0, 100000) / 100).toFixed(2);
    case 'bool':
      return rng() < 0.5 ? 'true' : 'false';
    case 'char':
    case 'varchar':
    case 'nchar':
    case 'nvarchar':
    case 'text':
    case 'ntext': {
      const text = textFor(rng, column.name, locale);
      const limit = lengthLimit(dialect, column);
      return limit != null ? [...text].slice(0, limit).join('') : text;
    }
    case 'date':
      return randomDate(rng);
    case 'time':
      return randomTime(rng);
    case 'datetime':
    case 'timestamptz':
      return `${randomDate(rng)} ${randomTime(rng)}`;
    case 'year':
      return String(int(rng, 1990, 2026));
    case 'uuid':
      return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${pick(rng, ['8', '9', 'a', 'b'])}${hex(rng, 3)}-${hex(rng, 12)}`;
    case 'inet':
      return `192.168.${int(rng, 0, 255)}.${int(rng, 1, 254)}`;
    default:
      return null;
  }
};

/* Rows */

type Context = { project: Project; schema: Schema; table: Table; rng: Rng; locale: Locale };

const isGenerated = (dialect: DialectId, column: Column) => column.autoIncrement || isSerial(dialect, column.type);

/** Makes a value unique against the ones already used, keeping it within the length limit. */
const uniqueValue = (ctx: Context, column: Column, used: Set<string>) => {
  const { project, rng, locale } = ctx;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const value = randomValue(project.dialect, column, rng, locale);
    if (value === null) return null;
    if (!used.has(value)) return value;
  }
  const base = randomValue(project.dialect, column, rng, locale)!;
  const def = findType(DIALECTS[project.dialect], column.type);
  if (def?.integer) {
    let n = Math.max(0, ...[...used].map(Number).filter(Number.isFinite)) + 1;
    while (used.has(String(n))) n += 1;
    return String(n);
  }
  const limit = lengthLimit(project.dialect, column);
  for (let i = 2; i < 10000; i += 1) {
    const suffix = `_${i}`;
    if (limit != null && suffix.length >= limit) break;
    const candidate = limit != null ? `${[...base].slice(0, limit - suffix.length).join('')}${suffix}` : `${base}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  // Very short columns (a 3 letter code) run out of suffixes; random letters and digits still fit.
  const size = Math.max(1, Math.min(limit ?? 8, 8));
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = Array.from({ length: size }, () => ALPHANUMERIC[int(rng, 0, ALPHANUMERIC.length - 1)]).join('');
    if (!used.has(candidate)) return candidate;
  }
  return null;
};

const sameColumns = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** FKs that must point to a different row each time: 1:1 relationships, or a UNIQUE on the FK columns. */
const uniqueForeignKeys = (table: Table) =>
  new Set(
    table.foreignKeys
      .filter(
        (fk) =>
          table.uniques.some((u) => sameColumns(u.columnIds, fk.columnIds)) ||
          (table.pk != null && sameColumns(table.pk.columnIds, fk.columnIds)) ||
          (fk.columnIds.length === 1 && table.columns.find((c) => c.id === fk.columnIds[0])?.unique),
      )
      .map((fk) => fk.id),
  );

const fkKey = (values: Record<string, string>, ids: string[]) => ids.map((id) => values[id] ?? '').join('\u0000');

export type GeneratedRows = { rows: Record<string, string>[]; missingRefs: string[] };

/**
 * Generates rows with random values. FK columns take values from rows that already exist in the
 * referenced table, auto increment keys continue the sequence, and PK or UNIQUE values are not repeated.
 */
export const generateRows = (
  project: Project,
  schema: Schema,
  tableId: string,
  count: number,
  rng: Rng = Math.random,
  locale: Locale = getLocale(),
): GeneratedRows => {
  const table = schema.tables.find((t) => t.id === tableId);
  if (!table) return { rows: [], missingRefs: [] };
  const ctx: Context = { project, schema, table, rng, locale };
  const records = project.records ?? {};
  const existing: DataRow[] = [...(records[tableId] ?? [])];
  const missingRefs = new Set<string>();
  const fkColumnIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
  const pkIds = table.pk?.columnIds ?? [];
  const pkKey = (values: Record<string, string>) => pkIds.map((id) => values[id] ?? '').join('\u0000');
  const usedPk = new Set(existing.map((r) => pkKey(r.values)));
  const usedByColumn = new Map(
    table.columns
      .filter((c) => c.unique || (c.pk && pkIds.length === 1))
      .map((c) => [c.id, new Set(existing.map((r) => r.values[c.id]).filter(Boolean))]),
  );
  const rows: Record<string, string>[] = [];
  const uniqueFks = uniqueForeignKeys(table);
  const usedRefs = new Map(
    table.foreignKeys.filter((fk) => uniqueFks.has(fk.id)).map((fk) => [fk.id, new Set(existing.map((r) => fkKey(r.values, fk.columnIds)))]),
  );

  for (let i = 0; i < count; i += 1) {
    let values: Record<string, string> = {};
    let exhausted = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      values = {};
      for (const fk of table.foreignKeys) {
        const used = usedRefs.get(fk.id);
        const refRows = (records[fk.refTableId] ?? []).filter((r) => !used?.has(fkKey(r.values, fk.refColumnIds)));
        if (refRows.length === 0) {
          if (used && (records[fk.refTableId] ?? []).length > 0) exhausted = true;
          else missingRefs.add(schema.tables.find((t) => t.id === fk.refTableId)?.name ?? '?');
          continue;
        }
        const ref = pick(rng, refRows);
        fk.columnIds.forEach((columnId, index) => {
          const value = ref.values[fk.refColumnIds[index]];
          if (value) values[columnId] = value;
        });
      }
      for (const column of table.columns) {
        if (fkColumnIds.has(column.id)) continue;
        if (isGenerated(project.dialect, column)) {
          values[column.id] = nextAutoValue([...existing, ...rows.map((v) => ({ id: '', values: v }))], column.id);
          continue;
        }
        const used = usedByColumn.get(column.id);
        const value = used ? uniqueValue(ctx, column, used) : randomValue(project.dialect, column, rng, locale);
        if (value !== null) values[column.id] = value;
      }
      if (pkIds.length === 0 || !usedPk.has(pkKey(values))) break;
    }
    // Every referenced row is already taken by a one-to-one FK, so no more valid rows fit.
    if (exhausted) break;
    usedPk.add(pkKey(values));
    for (const [fkId, used] of usedRefs) {
      const fk = table.foreignKeys.find((f) => f.id === fkId)!;
      used.add(fkKey(values, fk.columnIds));
    }
    for (const [columnId, used] of usedByColumn) if (values[columnId]) used.add(values[columnId]);
    rows.push(values);
  }
  return { rows, missingRefs: [...missingRefs] };
};

/** A random value for one cell, respecting FK references and uniqueness against the other rows. */
export const randomCellValue = (
  project: Project,
  schema: Schema,
  tableId: string,
  rowId: string,
  columnId: string,
  rng: Rng = Math.random,
): string | null => {
  const table = schema.tables.find((t) => t.id === tableId);
  const column = table?.columns.find((c) => c.id === columnId);
  if (!table || !column) return null;
  const records = project.records ?? {};
  const fk = table.foreignKeys.find((f) => f.columnIds.includes(columnId));
  if (fk) {
    const refColumnId = fk.refColumnIds[fk.columnIds.indexOf(columnId)];
    const options = (records[fk.refTableId] ?? []).map((r) => r.values[refColumnId]).filter(Boolean);
    return options.length ? pick(rng, options) : null;
  }
  const others = (records[tableId] ?? []).filter((r) => r.id !== rowId);
  if (isGenerated(project.dialect, column)) return nextAutoValue(others, columnId);
  if (column.unique || (column.pk && table.pk?.columnIds.length === 1)) {
    return uniqueValue({ project, schema, table, rng, locale: getLocale() }, column, new Set(others.map((r) => r.values[columnId]).filter(Boolean)));
  }
  return randomValue(project.dialect, column, rng);
};
