/**
 * What a statement does, read from its first words: whether it only reads, and whether it is one of the
 * statements that can wipe a lot at once (and so asks for the name of what it touches before running).
 */

export type StatementRisk =
  | { kind: 'noWhere'; verb: 'UPDATE' | 'DELETE'; target: string }
  | { kind: 'drop'; object: string; target: string }
  | { kind: 'truncate'; target: string }
  | { kind: 'alter'; target: string };

/** `ddl`: it changes structure, which MySQL and Oracle commit as soon as it runs. */
export type StatementInfo = { readOnly: boolean; risk?: StatementRisk; multiple: boolean; ddl: boolean };

const DDL = new Set(['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'COMMENT', 'GRANT', 'REVOKE']);

/** An Oracle PL/SQL block or stored unit: its inner ";" do not split it. */
const PLSQL = /^(?:BEGIN|DECLARE)\b|^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:FUNCTION|PROCEDURE|PACKAGE|TRIGGER|TYPE)\b/i;

/** The text with comments and string literals blanked out, so keywords inside them do not count. */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]/g, (name) => name);

const READING = new Set(['SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC', 'VALUES', 'TABLE']);

const unquote = (name: string) => name.replace(/^["`[]|["`\]]$/g, '');

/** The last part of a possibly qualified name ("public"."cliente" → cliente). */
const objectName = (raw: string | undefined) => (raw ? unquote(raw.split('.').pop() ?? raw) : '');

const NAME = String.raw`((?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[\w$]+)(?:\.(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[\w$]+))*)`;

export const statementInfo = (sql: string, engine?: string): StatementInfo => {
  const text = code(sql).trim().replace(/^\(+/, '');
  const plsql = engine === 'oracle' && PLSQL.test(text);
  const statements = plsql
    ? 1
    : text
        .replace(/\n\s*\/\s*$/, '')
        .split(';')
        .filter((s) => s.trim()).length;
  const first = /^[A-Za-z]+/.exec(text)?.[0]?.toUpperCase() ?? '';
  const readOnly = READING.has(first) || (first === 'PRAGMA' && !text.includes('='));
  // A WITH can end in a DELETE or UPDATE.
  const verb = first === 'WITH' ? (/\b(UPDATE|DELETE|INSERT|MERGE)\b/i.exec(text)?.[1]?.toUpperCase() ?? 'SELECT') : first;
  const info: StatementInfo = { readOnly: readOnly && verb === first ? true : READING.has(verb), multiple: statements > 1, ddl: DDL.has(first) };
  let match: RegExpExecArray | null;
  if (verb === 'DELETE' && (match = new RegExp(String.raw`\bDELETE\s+(?:FROM\s+)?${NAME}`, 'i').exec(text)) && !/\bWHERE\b/i.test(text)) {
    info.risk = { kind: 'noWhere', verb: 'DELETE', target: objectName(match[1]) };
  } else if (verb === 'UPDATE' && (match = new RegExp(String.raw`\bUPDATE\s+${NAME}`, 'i').exec(text)) && !/\bWHERE\b/i.test(text)) {
    info.risk = { kind: 'noWhere', verb: 'UPDATE', target: objectName(match[1]) };
  } else if ((match = new RegExp(String.raw`^DROP\s+(TABLE|VIEW|SCHEMA|DATABASE|INDEX|SEQUENCE|TYPE)\s+(?:IF\s+EXISTS\s+)?${NAME}`, 'i').exec(text))) {
    info.risk = { kind: 'drop', object: match[1].toUpperCase(), target: objectName(match[2]) };
  } else if ((match = new RegExp(String.raw`^TRUNCATE\s+(?:TABLE\s+)?${NAME}`, 'i').exec(text))) {
    info.risk = { kind: 'truncate', target: objectName(match[1]) };
  } else if ((match = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}`, 'i').exec(text))) {
    info.risk = { kind: 'alter', target: objectName(match[1]) };
  }
  return info;
};
