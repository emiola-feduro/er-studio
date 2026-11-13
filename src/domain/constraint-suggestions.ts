import { DIALECTS, findType, isEnum, quoteIdent, quoteLiteral, type Generic } from './dialects';
import type { Column, DialectId } from './types';

/**
 * Ready-made CHECK and partial index (WHERE) expressions that fit a column's type, written in the
 * syntax of each gestor, plus regular expressions and a check for column names that do not exist.
 */

export type SuggestionMeaning =
  | 'nonNegative'
  | 'positive'
  | 'range'
  | 'minLength'
  | 'notBlank'
  | 'upperCase'
  | 'afterDate'
  | 'regex.email'
  | 'regex.digits'
  | 'regex.code'
  | 'regex.slug'
  | 'regex.phone'
  | 'notNull'
  | 'isNull'
  | 'isTrue'
  | 'equals';

export type ExpressionSuggestion = { value: string; meaning: SuggestionMeaning; detail?: string };

type ColumnLike = Pick<Column, 'name' | 'type' | 'nullable'> & { enumValues?: string[] };

const NUMBER: Generic[] = ['tinyint', 'smallint', 'int', 'bigint', 'serial', 'bigserial', 'decimal', 'real', 'double', 'money'];
const TEXT: Generic[] = ['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext'];
const DATES: Generic[] = ['date', 'datetime', 'timestamptz'];

const length = (dialect: DialectId) => (dialect === 'sqlserver' ? 'LEN' : dialect === 'mysql' ? 'CHAR_LENGTH' : 'LENGTH');

const dateLiteral = (dialect: DialectId, generic: Generic, value: string) => {
  if (dialect === 'sqlite' || dialect === 'sqlserver') return quoteLiteral(value);
  return generic === 'date' ? `DATE ${quoteLiteral(value)}` : `TIMESTAMP ${quoteLiteral(`${value} 00:00:00`)}`;
};

/* Regular expressions */

export type RegexPreset = 'email' | 'digits' | 'code' | 'slug' | 'phone';

export const REGEX_PRESETS: Record<RegexPreset, string> = {
  email: '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$',
  digits: '^[0-9]+$',
  code: '^[A-Z0-9_-]+$',
  slug: '^[a-z0-9]+(-[a-z0-9]+)*$',
  phone: '^\\+?[0-9 ]{7,15}$',
};

/** LIKE patterns for SQL Server, which has no regular expressions in CHECK constraints. */
const SQLSERVER_LIKE: Record<RegexPreset, (q: string) => string> = {
  email: (q) => `${q} LIKE '%_@_%._%' AND ${q} NOT LIKE '% %'`,
  digits: (q) => `${q} NOT LIKE '%[^0-9]%'`,
  code: (q) => `${q} NOT LIKE '%[^A-Z0-9_-]%'`,
  slug: (q) => `${q} NOT LIKE '%[^a-z0-9-]%' AND ${q} NOT LIKE '-%' AND ${q} NOT LIKE '%-'`,
  phone: (q) => `${q} NOT LIKE '%[^0-9 +]%'`,
};

export type RegexSupport = 'native' | 'extension' | 'none';

/**
 * How each gestor matches a regular expression: PostgreSQL ~, MySQL REGEXP (enforced in CHECK since
 * 8.0.16), Oracle REGEXP_LIKE, SQLite REGEXP (needs an extension that provides it), SQL Server none.
 */
export const regexSupport = (dialect: DialectId): RegexSupport =>
  dialect === 'sqlserver' ? 'none' : dialect === 'sqlite' ? 'extension' : 'native';

/** Expression that requires the column to match a pattern, or null when the gestor cannot. */
export const regexExpression = (dialect: DialectId, columnName: string, pattern: string): string | null => {
  const q = quoteIdent(dialect, columnName);
  const p = quoteLiteral(pattern);
  switch (dialect) {
    case 'postgresql':
      return `${q} ~ ${p}`;
    case 'mysql':
    case 'sqlite':
      return `${q} REGEXP ${p}`;
    case 'oracle':
      return `REGEXP_LIKE(${q}, ${p})`;
    default:
      return null;
  }
};

const presetExpression = (dialect: DialectId, columnName: string, preset: RegexPreset) => {
  // POSIX classes such as [:space:] are not understood by every engine; plain ranges are safer there.
  const pattern = dialect === 'postgresql' || dialect === 'mysql' ? REGEX_PRESETS[preset] : REGEX_PRESETS[preset].replace(/\[:space:\]/g, ' ');
  return regexExpression(dialect, columnName, pattern) ?? SQLSERVER_LIKE[preset](quoteIdent(dialect, columnName));
};

/** CHECK suggestions for one column, most useful first. */
export const checkSuggestions = (dialect: DialectId, column: ColumnLike): ExpressionSuggestion[] => {
  if (isEnum(column.type)) return [];
  const generic = findType(DIALECTS[dialect], column.type)?.generic;
  if (!generic) return [];
  const q = quoteIdent(dialect, column.name);
  const s = (value: string, meaning: SuggestionMeaning, detail?: string): ExpressionSuggestion => ({ value, meaning, ...(detail ? { detail } : {}) });

  if (NUMBER.includes(generic)) return [s(`${q} >= 0`, 'nonNegative'), s(`${q} > 0`, 'positive'), s(`${q} BETWEEN 1 AND 100`, 'range')];
  if (TEXT.includes(generic)) {
    // Oracle stores '' as NULL, so "not blank" is written with IS NOT NULL there.
    const notBlank = dialect === 'oracle' ? `TRIM(${q}) IS NOT NULL` : `TRIM(${q}) <> ''`;
    const name = column.name.toLowerCase();
    const regex = (preset: RegexPreset) => s(presetExpression(dialect, column.name, preset), `regex.${preset}`);
    const likely: RegexPreset[] = /mail|correo|courriel/.test(name)
      ? ['email']
      : /tel|phone|fono|celular/.test(name)
        ? ['phone']
        : /slug|url/.test(name)
          ? ['slug']
          : /cod|code|sku|ref/.test(name)
            ? ['code', 'digits']
            : [];
    const rest = (['email', 'digits', 'code', 'slug', 'phone'] as RegexPreset[]).filter((p) => !likely.includes(p));
    return [
      ...likely.map(regex),
      s(notBlank, 'notBlank'),
      s(`${length(dialect)}(${q}) >= 3`, 'minLength'),
      s(`${q} = UPPER(${q})`, 'upperCase'),
      ...rest.map(regex),
    ];
  }
  if (DATES.includes(generic)) return [s(`${q} >= ${dateLiteral(dialect, generic, '2000-01-01')}`, 'afterDate')];
  return [];
};

/** WHERE suggestions for a partial index: the indexed columns first, then other filterable columns. */
export const whereSuggestions = (dialect: DialectId, indexed: ColumnLike[], others: ColumnLike[]): ExpressionSuggestion[] => {
  const result: ExpressionSuggestion[] = [];
  const add = (suggestion: ExpressionSuggestion) => {
    if (!result.some((r) => r.value === suggestion.value)) result.push(suggestion);
  };
  for (const column of indexed) if (column.nullable) add({ value: `${quoteIdent(dialect, column.name)} IS NOT NULL`, meaning: 'notNull' });
  for (const column of [...indexed, ...others]) {
    const q = quoteIdent(dialect, column.name);
    const generic = findType(DIALECTS[dialect], column.type)?.generic;
    if (generic === 'bool') add({ value: `${q} = ${dialect === 'sqlserver' ? '1' : 'TRUE'}`, meaning: 'isTrue' });
    if (isEnum(column.type)) for (const value of (column.enumValues ?? []).slice(0, 3)) add({ value: `${q} = ${quoteLiteral(value)}`, meaning: 'equals', detail: value });
    // A nullable date named like "deleted" is the usual soft delete: index only the live rows.
    if (column.nullable && generic && DATES.includes(generic) && /delet|borrad|elimin|supprim|exclu|archiv/i.test(column.name)) {
      add({ value: `${q} IS NULL`, meaning: 'isNull' });
    }
  }
  return result;
};

/* Unknown column names */

const KEYWORDS = new Set(
  `AND OR NOT NULL IS IN BETWEEN LIKE ILIKE ESCAPE TRUE FALSE REGEXP RLIKE SIMILAR TO CASE WHEN THEN ELSE END
   LENGTH LEN CHAR_LENGTH CHARACTER_LENGTH TRIM LTRIM RTRIM UPPER LOWER SUBSTRING SUBSTR COALESCE NULLIF ABS ROUND
   DATE TIME TIMESTAMP INTERVAL CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP NOW CAST AS REGEXP_LIKE MOD
   INTEGER INT BIGINT VARCHAR CHAR TEXT NUMERIC DECIMAL BOOLEAN COLLATE`.split(/\s+/),
);

/**
 * Identifiers in an expression that are neither columns nor SQL words or functions. Quoted strings
 * are skipped. Used to warn about typos such as "precio_unitaro >= 0".
 */
export const unknownIdentifiers = (expression: string, columns: string[]): string[] => {
  const known = new Set(columns.map((c) => c.toLowerCase()));
  const withoutStrings = expression.replace(/N?'(?:[^']|'')*'/g, ' ');
  const found = new Set<string>();
  for (const match of withoutStrings.matchAll(/"([^"]+)"|\[([^\]]+)\]|`([^`]+)`|\b([A-Za-z_][A-Za-z0-9_]*)\b(\s*\()?/g)) {
    const [, dq, br, bt, plain, call] = match;
    const name = dq ?? br ?? bt ?? plain;
    if (!name || call) continue;
    if (plain && (KEYWORDS.has(plain.toUpperCase()) || /^\d/.test(plain))) continue;
    if (!known.has(name.toLowerCase())) found.add(name);
  }
  return [...found];
};
