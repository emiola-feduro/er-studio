import { DIALECTS, findType, isSerial, lengthLimit, type Generic } from './dialects';
import type { Column, DataRow, DialectId, Project, Schema, Table } from './types';

/* Type checks for single values */

const INT_RANGES: Partial<Record<Generic, [bigint, bigint]>> = {
  tinyint: [-128n, 127n],
  smallint: [-32768n, 32767n],
  int: [-2147483648n, 2147483647n],
  serial: [-2147483648n, 2147483647n],
  bigint: [-9223372036854775808n, 9223372036854775807n],
  bigserial: [-9223372036854775808n, 9223372036854775807n],
};

const intRange = (dialect: DialectId, type: string, generic: Generic): [bigint, bigint] | 'digits38' | undefined => {
  const name = type.toUpperCase();
  if (dialect === 'oracle' && (generic === 'int' || generic === 'smallint')) return 'digits38';
  if (dialect === 'sqlite') return INT_RANGES.bigint;
  if (name === 'MEDIUMINT') return [-8388608n, 8388607n];
  if (dialect === 'sqlserver' && generic === 'tinyint') return [0n, 255n];
  if (name === 'SMALLSERIAL') return INT_RANGES.smallint;
  return INT_RANGES[generic];
};

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/;
const IPV6 = /^[0-9a-f:]+(\/\d{1,3})?$/i;
const HEX = /^(0x|\\x)([0-9a-f]*)$/i;

const validDate = (text: string) => {
  const match = DATE.exec(text);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const splitDateTime = (text: string) => {
  const [date, rest] = text.split(/[ T]/, 2);
  return { date, rest };
};

const validDateTime = (text: string, withZone: boolean) => {
  const { date, rest } = splitDateTime(text);
  if (!validDate(date)) return false;
  if (rest === undefined) return true;
  const zone = withZone ? /(Z|[+-]\d{2}(:?\d{2})?)$/i.exec(rest) : null;
  const time = zone ? rest.slice(0, zone.index) : rest;
  return TIME.test(time);
};

const BOOLEAN_VALUES = new Set(['true', 'false', '1', '0']);

/** Returns an error message for a value that does not fit the column type, or null when it fits. */
export const validateValue = (
  dialect: DialectId,
  column: Pick<Column, 'type' | 'length' | 'precision' | 'scale' | 'enumValues'>,
  raw: string,
): string | null => {
  const value = raw.trim();
  const def = findType(DIALECTS[dialect], column.type);
  if (!def) return null; // custom types are not checked
  const { generic } = def;

  if (def.integer || def.serial) {
    if (!INTEGER.test(value)) return 'Debe ser un número entero.';
    const range = intRange(dialect, column.type, generic);
    if (range === 'digits38') return value.replace(/^[+-]/, '').length > 38 ? 'Máximo 38 dígitos.' : null;
    if (range) {
      const n = BigInt(value);
      if (n < range[0] || n > range[1]) return `Fuera de rango para ${column.type} (${range[0]} a ${range[1]}).`;
    }
    return null;
  }

  switch (generic) {
    case 'enum': {
      const allowed = column.enumValues ?? [];
      return allowed.includes(raw) ? null : `Valores permitidos: ${allowed.join(', ') || 'ninguno definido'}.`;
    }
    case 'decimal': {
      if (!DECIMAL.test(value)) return 'Debe ser un número decimal (usa punto como separador).';
      const { precision, scale } = column;
      if (precision == null) return null;
      const [intPart, fracPart = ''] = value.replace(/^[+-]/, '').split('.');
      const s = scale ?? 0;
      const intDigits = intPart.replace(/^0+(?=\d)/, '').replace(/^0$/, '').length;
      if (fracPart.length > s) return `Máximo ${s} decimales.`;
      if (intDigits > precision - s) return `Máximo ${precision - s} dígitos antes del punto (${column.type}(${precision},${s})).`;
      return null;
    }
    case 'real':
    case 'double':
    case 'money':
      return DECIMAL.test(value) || /^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(value) ? null : 'Debe ser un número.';
    case 'bool':
      return BOOLEAN_VALUES.has(value.toLowerCase()) ? null : 'Usa true, false, 1 o 0.';
    case 'char':
    case 'varchar':
    case 'nchar':
    case 'nvarchar': {
      const limit = lengthLimit(dialect, column);
      const size = [...raw].length;
      return limit != null && size > limit ? `Máximo ${limit} caracteres (tiene ${size}).` : null;
    }
    case 'date':
      if (dialect === 'oracle') return validDateTime(value, false) ? null : 'Usa el formato AAAA-MM-DD o AAAA-MM-DD HH:MM:SS.';
      return validDate(value) ? null : 'Usa una fecha válida con formato AAAA-MM-DD.';
    case 'time':
      return TIME.test(value) ? null : 'Usa el formato HH:MM o HH:MM:SS.';
    case 'datetime':
      return validDateTime(value, false) ? null : 'Usa el formato AAAA-MM-DD HH:MM:SS.';
    case 'timestamptz':
      return validDateTime(value, true) ? null : 'Usa AAAA-MM-DD HH:MM:SS, con zona opcional (+02:00 o Z).';
    case 'year': {
      if (!/^\d{4}$/.test(value)) return 'Usa un año de 4 dígitos.';
      const year = Number(value);
      return dialect === 'mysql' && (year < 1901 || year > 2155) ? 'MySQL acepta años entre 1901 y 2155.' : null;
    }
    case 'uuid':
      return UUID.test(value) ? null : 'Debe ser un UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).';
    case 'json':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'No es JSON válido.';
      }
    case 'xml':
      return value.startsWith('<') && value.endsWith('>') ? null : 'Debe ser XML (empieza con < y termina con >).';
    case 'inet':
      return IPV4.test(value) || (value.includes(':') && IPV6.test(value)) ? null : 'Debe ser una dirección IP.';
    case 'binary':
    case 'varbinary':
    case 'blob': {
      const hex = HEX.exec(value);
      if (!hex) return value.startsWith('0x') || value.startsWith('\\x') ? 'Hexadecimal inválido.' : null;
      if (hex[2].length % 2 !== 0) return 'El hexadecimal debe tener un número par de dígitos.';
      const limit = lengthLimit(dialect, column);
      return limit != null && hex[2].length / 2 > limit ? `Máximo ${limit} bytes.` : null;
    }
    default:
      return null;
  }
};

/** Normalized form used to compare values for UNIQUE, PK and FK checks. */
const canonical = (dialect: DialectId, column: Column, raw: string) => {
  const value = raw.trim();
  const def = findType(DIALECTS[dialect], column.type);
  if (!def) return value;
  if ((def.integer || def.serial) && INTEGER.test(value)) return BigInt(value).toString();
  if (['decimal', 'real', 'double', 'money'].includes(def.generic) && DECIMAL.test(value)) return String(Number(value));
  if (def.generic === 'bool') return ['true', '1'].includes(value.toLowerCase()) ? '1' : '0';
  if (def.generic === 'uuid') return value.toLowerCase();
  return value;
};

/* Whole-table checks */

export type RecordIssues = {
  /** tableId -> rowId -> columnId -> message */
  cells: Map<string, Map<string, Map<string, string>>>;
  countByTable: Map<string, number>;
  total: number;
};

const isGenerated = (dialect: DialectId, column: Column) => column.autoIncrement || isSerial(dialect, column.type);

export const isBlank = (row: DataRow, columnId: string) => !(row.values[columnId] ?? '').trim();

export const validateRecords = (project: Project, schema: Schema): RecordIssues => {
  const { dialect } = project;
  const records = project.records ?? {};
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const issues: RecordIssues = { cells: new Map(), countByTable: new Map(), total: 0 };

  const add = (table: Table, rowId: string, columnId: string, message: string) => {
    let rows = issues.cells.get(table.id);
    if (!rows) issues.cells.set(table.id, (rows = new Map()));
    let cols = rows.get(rowId);
    if (!cols) rows.set(rowId, (cols = new Map()));
    if (cols.has(columnId)) return;
    cols.set(columnId, message);
    issues.countByTable.set(table.id, (issues.countByTable.get(table.id) ?? 0) + 1);
    issues.total += 1;
  };

  const tuple = (table: Table, row: DataRow, columnIds: string[]) =>
    columnIds.map((id) => canonical(dialect, table.columns.find((c) => c.id === id)!, row.values[id] ?? '')).join('\u0000');

  const checkUnique = (table: Table, rows: DataRow[], columnIds: string[], label: string) => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (columnIds.some((id) => isBlank(row, id))) continue;
      const key = tuple(table, row, columnIds);
      if (seen.has(key)) for (const id of columnIds) add(table, row.id, id, `Valor repetido: ${label} debe ser único.`);
      else seen.set(key, row.id);
    }
  };

  for (const table of schema.tables) {
    const rows = records[table.id] ?? [];
    if (rows.length === 0) continue;

    for (const row of rows) {
      for (const column of table.columns) {
        const raw = row.values[column.id] ?? '';
        if (!raw.trim()) {
          const required = !column.nullable && !isGenerated(dialect, column) && !column.defaultValue?.trim();
          if (required) add(table, row.id, column.id, column.pk ? 'La llave primaria es obligatoria.' : 'Campo obligatorio (NOT NULL).');
          continue;
        }
        const error = validateValue(dialect, column, raw);
        if (error) add(table, row.id, column.id, error);
      }
    }

    if (table.pk) checkUnique(table, rows, table.pk.columnIds, table.pk.columnIds.length > 1 ? 'la combinación de la PK' : 'la PK');
    for (const column of table.columns) if (column.unique && !column.pk) checkUnique(table, rows, [column.id], column.name);
    for (const uq of table.uniques) checkUnique(table, rows, uq.columnIds, uq.name);

    for (const fk of table.foreignKeys) {
      const ref = tables.get(fk.refTableId);
      if (!ref) continue;
      const refRows = records[ref.id] ?? [];
      const existing = new Set(refRows.map((r) => tuple(ref, r, fk.refColumnIds)));
      for (const row of rows) {
        const blanks = fk.columnIds.filter((id) => isBlank(row, id));
        if (blanks.length === fk.columnIds.length) continue;
        if (blanks.length > 0) {
          for (const id of blanks) add(table, row.id, id, 'FK compuesta incompleta.');
          continue;
        }
        if (!existing.has(tuple(table, row, fk.columnIds))) {
          const values = fk.columnIds.map((id) => row.values[id]).join(', ');
          for (const id of fk.columnIds) add(table, row.id, id, `No existe un registro en ${ref.name} con (${values}).`);
        }
      }
    }
  }
  return issues;
};

/** Next value for an auto increment column: one more than the largest integer already used. */
export const nextAutoValue = (rows: DataRow[], columnId: string) => {
  let max = 0n;
  for (const row of rows) {
    const value = row.values[columnId]?.trim();
    if (value && INTEGER.test(value) && BigInt(value) > max) max = BigInt(value);
  }
  return (max + 1n).toString();
};

/** Excel-friendly value: numbers, booleans and dates become native cell types when valid. */
export const typedValue = (dialect: DialectId, column: Column, raw: string): string | number | boolean | Date | null => {
  const value = raw.trim();
  if (!value) return null;
  if (validateValue(dialect, column, value)) return raw;
  const def = findType(DIALECTS[dialect], column.type);
  if (!def) return raw;
  if (def.integer || def.serial) {
    const n = BigInt(value);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : value;
  }
  switch (def.generic) {
    case 'decimal':
    case 'real':
    case 'double':
    case 'money':
      return Number(value);
    case 'bool':
      return ['true', '1'].includes(value.toLowerCase());
    case 'date':
      if (DATE.test(value)) return new Date(`${value}T00:00:00Z`);
      return raw;
    case 'datetime': {
      const { date, rest } = splitDateTime(value);
      return new Date(`${date}T${rest ?? '00:00:00'}Z`);
    }
    default:
      return raw;
  }
};
