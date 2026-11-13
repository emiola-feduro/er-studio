import { DIALECTS, findType, isEnum, isSerial, quoteLiteral, type Generic } from './dialects';
import type { Attribute, DialectId } from './types';

/** What a suggested default does, so the interface can describe it in the user's language. */
export type DefaultMeaning =
  | 'now'
  | 'today'
  | 'currentTime'
  | 'currentYear'
  | 'true'
  | 'false'
  | 'zero'
  | 'one'
  | 'emptyText'
  | 'newUuid'
  | 'emptyJson'
  | 'enumValue';

export type DefaultSuggestion = { value: string; meaning: DefaultMeaning };

type Column = Pick<Attribute, 'type' | 'enumValues' | 'autoIncrement'>;

const s = (value: string, meaning: DefaultMeaning): DefaultSuggestion => ({ value, meaning });

const NOW: Record<DialectId, { datetime: string; timestamptz: string; date: string; time: string }> = {
  postgresql: { datetime: 'LOCALTIMESTAMP', timestamptz: 'CURRENT_TIMESTAMP', date: 'CURRENT_DATE', time: 'LOCALTIME' },
  // MySQL 8.0.13+ needs parentheses around expression defaults other than CURRENT_TIMESTAMP.
  mysql: { datetime: 'CURRENT_TIMESTAMP', timestamptz: 'CURRENT_TIMESTAMP', date: '(CURRENT_DATE)', time: '(CURRENT_TIME)' },
  sqlite: { datetime: 'CURRENT_TIMESTAMP', timestamptz: 'CURRENT_TIMESTAMP', date: 'CURRENT_DATE', time: 'CURRENT_TIME' },
  sqlserver: { datetime: 'SYSDATETIME()', timestamptz: 'SYSDATETIMEOFFSET()', date: 'CAST(GETDATE() AS DATE)', time: 'CAST(SYSDATETIME() AS TIME)' },
  oracle: { datetime: 'LOCALTIMESTAMP', timestamptz: 'SYSTIMESTAMP', date: 'TRUNC(SYSDATE)', time: "TO_CHAR(SYSDATE, 'HH24:MI:SS')" },
};

const NEW_UUID: Partial<Record<DialectId, string>> = {
  postgresql: 'gen_random_uuid()',
  mysql: '(UUID())',
  sqlserver: 'NEWID()',
  oracle: 'SYS_GUID()',
};

const TEXT: Generic[] = ['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext'];
const NUMBER: Generic[] = ['tinyint', 'smallint', 'int', 'bigint', 'decimal', 'real', 'double', 'money'];

/**
 * Defaults that fit the column type in the syntax of each gestor, most useful first.
 * Empty for columns the database fills by itself (auto increment) and for types without a sensible default.
 */
export const defaultSuggestions = (dialect: DialectId, column: Column): DefaultSuggestion[] => {
  if (column.autoIncrement || isSerial(dialect, column.type)) return [];
  if (isEnum(column.type)) return (column.enumValues ?? []).map((v) => s(quoteLiteral(v), 'enumValue'));
  const generic = findType(DIALECTS[dialect], column.type)?.generic;
  if (!generic) return [];
  const now = NOW[dialect];
  switch (generic) {
    case 'datetime':
      return [s(now.datetime, 'now')];
    case 'timestamptz':
      return [s(now.timestamptz, 'now')];
    case 'date':
      return [s(now.date, 'today')];
    case 'time':
      return [s(now.time, 'currentTime')];
    case 'year':
      return [s('(YEAR(CURDATE()))', 'currentYear')];
    case 'bool':
      return dialect === 'sqlserver' ? [s('1', 'true'), s('0', 'false')] : [s('TRUE', 'true'), s('FALSE', 'false')];
    case 'uuid':
      return NEW_UUID[dialect] ? [s(NEW_UUID[dialect]!, 'newUuid')] : [];
    case 'json':
      return [s(dialect === 'mysql' ? '(JSON_OBJECT())' : "'{}'", 'emptyJson')];
    default:
      if (NUMBER.includes(generic)) return [s('0', 'zero'), s('1', 'one')];
      // MySQL cannot give TEXT columns a plain literal default.
      if (TEXT.includes(generic) && !(dialect === 'mysql' && generic === 'text')) return [s("''", 'emptyText')];
      return [];
  }
};

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const QUOTED = /^N?'(?:[^']|'')*'$/i;
/** A function call, a parenthesized expression, NULL or an upper case keyword such as CURRENT_TIMESTAMP. */
const isExpression = (value: string) => value.includes('(') || /^null$/i.test(value) || /^[A-Z_][A-Z0-9_]*$/.test(value);

export type DefaultProblem = 'unquotedText' | 'notANumber' | 'notABoolean' | 'unquotedDate';

/** Common mistakes in a default value for its column type, or null when it looks right. */
export const defaultValueProblem = (dialect: DialectId, column: Column & { defaultValue?: string }): DefaultProblem | null => {
  const value = column.defaultValue?.trim();
  if (!value || isEnum(column.type)) return null;
  const generic = findType(DIALECTS[dialect], column.type)?.generic;
  if (!generic) return null;
  if (TEXT.includes(generic)) {
    // A bare word such as pendiente is read as a column or keyword, not as text.
    return QUOTED.test(value) || NUMERIC.test(value) || isExpression(value) ? null : 'unquotedText';
  }
  if (NUMBER.includes(generic)) return NUMERIC.test(value) || isExpression(value) ? null : 'notANumber';
  if (generic === 'bool') {
    const ok = dialect === 'sqlserver' ? ['0', '1'] : ['TRUE', 'FALSE', '0', '1'];
    return ok.includes(value.toUpperCase()) || (isExpression(value) && !['TRUE', 'FALSE'].includes(value.toUpperCase())) ? null : 'notABoolean';
  }
  if (generic === 'date' || generic === 'datetime' || generic === 'timestamptz' || generic === 'time') {
    return /^\d/.test(value) ? 'unquotedDate' : null;
  }
  return null;
};
