import { DIALECTS, findType, isEnum, quoteLiteral, type Generic } from './dialects';
import type { Column, DialectId } from './types';

/**
 * Suggestions for the WHERE of the query builder that follow what is being typed: a condition per
 * column when the field is empty, operators that fit the type right after a column (BETWEEN for a
 * number, LIKE for text, the last 30 days for a date, the allowed values of an enum), and AND or OR
 * after a complete condition. Each suggestion is the whole new text of the field.
 */

export type WhereMeaning =
  | 'positive'
  | 'range'
  | 'equalsValue'
  | 'oneOf'
  | 'contains'
  | 'containsCi'
  | 'startsWith'
  | 'endsWith'
  | 'notBlank'
  | 'lastDays'
  | 'afterDate'
  | 'isTrue'
  | 'isFalse'
  | 'equals'
  | 'notNull'
  | 'noValue'
  | 'and'
  | 'or'
  | 'column';

export type WhereColumn = { ref: string; column: Pick<Column, 'name' | 'type' | 'nullable'> & { enumValues?: string[] } };

export type WhereCompletion = { value: string; display: string; meaning: WhereMeaning; detail?: string };

const NUMBER: Generic[] = ['tinyint', 'smallint', 'int', 'bigint', 'serial', 'bigserial', 'decimal', 'real', 'double', 'money'];
const TEXT: Generic[] = ['char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext'];
const DATES: Generic[] = ['date', 'datetime', 'timestamptz'];

const LAST_30_DAYS: Record<DialectId, string> = {
  postgresql: ">= CURRENT_DATE - INTERVAL '30 days'",
  mysql: '>= CURDATE() - INTERVAL 30 DAY',
  sqlserver: '>= DATEADD(day, -30, CAST(GETDATE() AS date))',
  sqlite: ">= date('now', '-30 days')",
  oracle: '>= TRUNC(SYSDATE) - 30',
};

const dateLiteral = (dialect: DialectId, generic: Generic, value: string) => {
  if (dialect === 'sqlite' || dialect === 'sqlserver') return quoteLiteral(value);
  return generic === 'date' ? `DATE ${quoteLiteral(value)}` : `TIMESTAMP ${quoteLiteral(`${value} 00:00:00`)}`;
};

type Operator = { op: string; meaning: WhereMeaning; detail?: string };

/** Operators that make sense for a column, most useful first. */
export const operatorsFor = (dialect: DialectId, column: WhereColumn['column'], sample: string): Operator[] => {
  const ops: Operator[] = [];
  const generic = findType(DIALECTS[dialect], column.type)?.generic;
  if (isEnum(column.type)) {
    const values = column.enumValues ?? [];
    for (const value of values.slice(0, 4)) ops.push({ op: `= ${quoteLiteral(value)}`, meaning: 'equals', detail: value });
    if (values.length > 1) ops.push({ op: `IN (${values.slice(0, 2).map(quoteLiteral).join(', ')})`, meaning: 'oneOf' });
  } else if (generic === 'bool') {
    const [yes, no] = dialect === 'sqlserver' ? ['1', '0'] : ['TRUE', 'FALSE'];
    ops.push({ op: `= ${yes}`, meaning: 'isTrue' }, { op: `= ${no}`, meaning: 'isFalse' });
  } else if (generic && NUMBER.includes(generic)) {
    ops.push(
      { op: '= 1', meaning: 'equalsValue' },
      { op: '> 0', meaning: 'positive' },
      { op: 'BETWEEN 1 AND 100', meaning: 'range' },
      { op: 'IN (1, 2, 3)', meaning: 'oneOf' },
    );
  } else if (generic && TEXT.includes(generic)) {
    const name = column.name.toLowerCase();
    if (/mail|correo|courriel/.test(name)) ops.push({ op: "LIKE '%@example.com'", meaning: 'endsWith' });
    ops.push({ op: `LIKE ${quoteLiteral(`%${sample}%`)}`, meaning: 'contains' });
    if (dialect === 'postgresql') ops.push({ op: `ILIKE ${quoteLiteral(`%${sample}%`)}`, meaning: 'containsCi' });
    ops.push({ op: `LIKE ${quoteLiteral(`${sample}%`)}`, meaning: 'startsWith' }, { op: `= ${quoteLiteral(sample)}`, meaning: 'equalsValue' });
    ops.push({ op: dialect === 'oracle' ? 'IS NOT NULL' : "<> ''", meaning: 'notBlank' });
  } else if (generic && DATES.includes(generic)) {
    const year = new Date().getFullYear();
    ops.push(
      { op: LAST_30_DAYS[dialect], meaning: 'lastDays' },
      { op: `>= ${dateLiteral(dialect, generic, `${year}-01-01`)}`, meaning: 'afterDate' },
      { op: `BETWEEN ${dateLiteral(dialect, generic, `${year}-01-01`)} AND ${dateLiteral(dialect, generic, `${year}-12-31`)}`, meaning: 'range' },
    );
  }
  if (column.nullable) ops.push({ op: 'IS NOT NULL', meaning: 'notNull' }, { op: 'IS NULL', meaning: 'noValue' });
  return ops;
};

// "alias.column" at the end of the text, optionally followed by spaces.
const TRAILING_REF = /(?:^|[\s(])([A-Za-z_][A-Za-z0-9_]*\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))\s*$/;
const AFTER_CONNECTOR = /(?:^|\s)(AND|OR|NOT)\s+$|\(\s*$/i;
// Words after which a condition is still incomplete.
const INCOMPLETE = /(?:=|<>|!=|<|>|<=|>=|\b(?:LIKE|ILIKE|IN|IS|NOT|BETWEEN|AND|OR))\s*$/i;

export const whereCompletions = (dialect: DialectId, columns: WhereColumn[], text: string, sample: string): WhereCompletion[] => {
  const byRef = new Map(columns.map((c) => [c.ref.toLowerCase(), c]));

  // Empty field: one typical condition per column.
  if (!text.trim()) {
    return columns.flatMap((c) => {
      const first = operatorsFor(dialect, c.column, sample)[0];
      return first ? [{ value: `${c.ref} ${first.op}`, display: `${c.ref} ${first.op}`, meaning: first.meaning, detail: first.detail }] : [];
    });
  }

  // Right after a column: the operators for its type.
  const ref = TRAILING_REF.exec(text)?.[1];
  const target = ref ? byRef.get(ref.toLowerCase()) : undefined;
  if (target) {
    const head = text.trimEnd();
    return operatorsFor(dialect, target.column, sample).map((o) => ({ value: `${head} ${o.op}`, display: `${target.ref} ${o.op}`, meaning: o.meaning, detail: o.detail }));
  }

  // After AND, OR, NOT or "(": the columns.
  if (AFTER_CONNECTOR.test(text)) {
    return columns.map((c) => ({ value: `${text}${c.ref} `, display: c.ref, meaning: 'column' as const }));
  }

  // After a complete condition and a space: AND or OR.
  if (/\s$/.test(text) && !INCOMPLETE.test(text.trimEnd()) && !/'[^']*$/.test(text.replace(/'[^']*'/g, ''))) {
    const head = text.trimEnd();
    return [
      { value: `${head} AND `, display: 'AND', meaning: 'and' },
      { value: `${head} OR `, display: 'OR', meaning: 'or' },
    ];
  }
  return [];
};
