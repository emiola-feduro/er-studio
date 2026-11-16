import type { DialectId } from './types';

/**
 * Rewrites the SQL of another gestor so SQLite can run it in the browser: functions, date math,
 * typed literals and row limits that SQLite writes differently. Quoted strings are left alone.
 */

type Rule = [RegExp, string | ((...groups: string[]) => string)];

const days = (n: string) => `date('now', '-${n} days')`;

// Patterns that include a quoted string, applied to the whole text first.
const WITH_STRINGS: Rule[] = [
  [/\bREGEXP_LIKE\s*\(\s*([^,()]+?)\s*,\s*('(?:[^']|'')*')\s*\)/gi, (_m, column, pattern) => `${column} REGEXP ${pattern}`],
  [/\bCURRENT_DATE\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, (_m, n) => days(n)],
];

// Applied to the text outside quoted strings, in order.
const COMMON: Rule[] = [
  [/\bILIKE\b/gi, 'LIKE'],
  [/\bNOT\s+ILIKE\b/gi, 'NOT LIKE'],
  [/\s!~\*?\s/g, ' NOT REGEXP '],
  [/\s~\*?\s/g, ' REGEXP '],
  [/\b(?:CHAR_LENGTH|CHARACTER_LENGTH|LEN)\s*\(/gi, 'LENGTH('],
  [/\bCURDATE\(\)\s*-\s*INTERVAL\s+(\d+)\s+DAY\b/gi, (_m, n) => days(n)],
  [/\bDATEADD\s*\(\s*day\s*,\s*-(\d+)\s*,\s*(?:CAST\s*\(\s*GETDATE\(\)\s+AS\s+date\s*\)|GETDATE\(\))\s*\)/gi, (_m, n) => days(n)],
  [/\bTRUNC\s*\(\s*SYSDATE\s*\)\s*-\s*(\d+)\b/gi, (_m, n) => days(n)],
  [/\bCURDATE\(\)|\bTRUNC\s*\(\s*SYSDATE\s*\)|\bCAST\s*\(\s*GETDATE\(\)\s+AS\s+date\s*\)/gi, "date('now')"],
  [/\bNOW\(\)|\bGETDATE\(\)|\bSYSDATETIME\(\)|\bSYSTIMESTAMP\b|\bSYSDATE\b/gi, "datetime('now')"],
  // DATE '2025-01-01' and TIMESTAMP '2025-01-01 00:00:00' are plain text in SQLite (the string is the next segment).
  [/\b(?:DATE|TIMESTAMP)\s+$/gi, ''],
];

/** Splits into code and quoted strings so the rules never touch the strings. */
const segments = (sql: string) => sql.split(/('(?:[^']|'')*')/g);

const applyRules = (sql: string) =>
  segments(WITH_STRINGS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement as never), sql))
    .map((part, index) => {
      if (index % 2 === 1) return part;
      let out = part;
      for (const [pattern, replacement] of COMMON) out = out.replace(pattern, replacement as never);
      return out;
    })
    .join('');

/** SELECT TOP (n) and FETCH FIRST n ROWS ONLY become LIMIT n at the end. */
const rowLimit = (sql: string) => {
  let limit: string | undefined;
  let out = sql.replace(/\bSELECT(\s+DISTINCT)?\s+TOP\s*\(?\s*(\d+)\s*\)?/i, (_m, distinct: string | undefined, n: string) => {
    limit = n;
    return `SELECT${distinct ?? ''}`;
  });
  out = out.replace(/\s*\bFETCH\s+FIRST\s+(\d+)\s+ROWS?\s+ONLY\b/i, (_m, n: string) => {
    limit = n;
    return '';
  });
  if (!limit || /\bLIMIT\s+\d+/i.test(out)) return out;
  const trimmed = out.replace(/\s*;?\s*$/, '');
  return `${trimmed}\nLIMIT ${limit};`;
};

export const toSqlite = (sql: string, from: DialectId): string => {
  if (from === 'sqlite' || !sql) return sql;
  return rowLimit(applyRules(sql));
};

/** Removes comments and quoted strings, to look at the statements themselves. */
const codeOnly = (sql: string) =>
  sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** One statement that only reads: it starts with SELECT or WITH and has no second statement. */
export const isReadOnlySelect = (sql: string) => {
  const code = codeOnly(sql).trim().replace(/;\s*$/, '');
  if (!code || code.includes(';')) return false;
  if (!/^(SELECT|WITH)\b/i.test(code)) return false;
  // A WITH can hide a write: WITH x AS (...) DELETE FROM ...
  return !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(code);
};
