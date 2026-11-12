import { DIALECTS, displayType, findType, lengthLimit } from '../domain/dialects';
import { isSerial } from '../domain/dialects';
import type { Column, DialectId } from '../domain/types';

export type CellInputKind = 'bool' | 'enum' | 'date' | 'time' | 'integer' | 'decimal' | 'text';

/** Which input control fits a column type. */
export const cellInputKind = (dialect: DialectId, column: Column): CellInputKind => {
  const def = findType(DIALECTS[dialect], column.type);
  if (!def) return 'text';
  if (def.integer || def.serial) return 'integer';
  if (def.generic === 'bool') return 'bool';
  if (def.generic === 'enum') return 'enum';
  if (def.generic === 'date' && dialect !== 'oracle') return 'date';
  if (def.generic === 'time') return 'time';
  if (['decimal', 'real', 'double', 'money'].includes(def.generic)) return 'decimal';
  return 'text';
};

/** Hint shown inside an empty cell: what the database will do with it. */
export const cellPlaceholder = (dialect: DialectId, column: Column) => {
  if (column.autoIncrement || isSerial(dialect, column.type)) return 'automático';
  if (column.defaultValue?.trim()) return `por defecto ${column.defaultValue.trim()}`;
  const def = findType(DIALECTS[dialect], column.type);
  if (def?.generic === 'datetime' || def?.generic === 'timestamptz') return 'AAAA-MM-DD HH:MM:SS';
  if (def?.generic === 'date') return 'AAAA-MM-DD';
  if (def?.generic === 'uuid') return 'xxxxxxxx-xxxx-...';
  return column.nullable ? 'NULL' : '';
};

export const columnTypeLabel = (dialect: DialectId, column: Column) => displayType(dialect, column);

export const columnMaxLength = (dialect: DialectId, column: Column) => {
  const def = findType(DIALECTS[dialect], column.type);
  return def && ['char', 'varchar', 'nchar', 'nvarchar'].includes(def.generic) ? lengthLimit(dialect, column) : undefined;
};
