import { displayType, quoteIdent } from './dialects';
import { operatorsFor, type WhereMeaning } from './query-where';
import type { Column, DialectId, Schema, Table } from './types';

/**
 * Autocomplete for SQL written by hand: what fits at the cursor, from the text before it and the
 * tables of the model. Tables after FROM and JOIN, the ON condition from the foreign keys, columns
 * of the tables in the query (by alias after "alias."), functions, keywords, and operators that
 * fit a column's type after it in WHERE.
 */

export type CompletionKind = 'keyword' | 'table' | 'column' | 'function' | 'join' | 'operator';

export type SqlCompletion = {
  /** What the list shows. */
  label: string;
  /** Text that replaces the word being typed. */
  insert: string;
  kind: CompletionKind;
  /** Type of a column, table of a column, or meaning of an operator. */
  detail?: string;
  meaning?: WhereMeaning;
};

export type SqlCompletionResult = { from: number; to: number; items: SqlCompletion[] };

const MAX = 40;

const CLAUSE_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'AS', 'DISTINCT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'ASC', 'DESC', 'UNION', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'EXISTS', 'OFFSET'];

const FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'UPPER', 'LOWER', 'LENGTH', 'TRIM', 'SUBSTR', 'ROUND', 'ABS', 'CAST', 'DATE', 'REPLACE'];

const WORDS_NOT_ALIAS = new Set(
  'ON WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS GROUP ORDER HAVING LIMIT UNION AS SET USING NATURAL OFFSET FETCH WINDOW FROM SELECT AND OR NOT IN IS LIKE BETWEEN ASC DESC'.split(' '),
);

type TableRef = { table: Table; alias?: string };

/** Hides strings and comments (keeping the length) so the context reads only code. */
const codeOf = (text: string) =>
  text
    .replace(/'(?:[^']|'')*'?/g, (m) => ' '.repeat(m.length))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (m) => ' '.repeat(m.length));

/** Whether the cursor is inside a string or a comment, where nothing should be offered. */
const insideStringOrComment = (before: string) => {
  let quote = false;
  for (let i = 0; i < before.length; i += 1) {
    const c = before[i];
    if (quote) {
      if (c === "'") quote = false;
      continue;
    }
    if (c === "'") quote = true;
    else if (c === '-' && before[i + 1] === '-') {
      const end = before.indexOf('\n', i);
      if (end < 0) return true;
      i = end;
    } else if (c === '/' && before[i + 1] === '*') {
      const end = before.indexOf('*/', i + 2);
      if (end < 0) return true;
      i = end + 1;
    }
  }
  return quote;
};

const unquote = (name: string) => name.replace(/^["`[](.*)["`\]]$/, '$1');
const IDENT = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)`;

/** Tables named after FROM, JOIN or a comma in the FROM list, with their aliases. */
export const tableRefs = (code: string, schema: Schema): TableRef[] => {
  const byName = new Map(schema.tables.map((t) => [t.name.toLowerCase(), t]));
  const refs: TableRef[] = [];
  // The alias is never a keyword, so "FROM a JOIN b" does not take JOIN as a's alias.
  const notKeyword = `(?!(?:${[...WORDS_NOT_ALIAS].join('|')})\\b)`;
  const pattern = new RegExp(String.raw`(?:\bFROM|\bJOIN|,)\s+(${IDENT}(?:\.${IDENT})?)(?:\s+(?:AS\s+)?${notKeyword}(${IDENT}))?`, 'gi');
  for (const match of code.matchAll(pattern)) {
    const name = unquote(match[1].split('.').pop()!);
    const table = byName.get(name.toLowerCase());
    if (!table) continue;
    const alias = match[2] && !WORDS_NOT_ALIAS.has(match[2].toUpperCase()) ? unquote(match[2]) : undefined;
    if (!refs.some((r) => r.table.id === table.id && r.alias === alias)) refs.push({ table, alias });
  }
  return refs;
};

/** The main clause the cursor is in. */
const clauseAt = (code: string) => {
  let clause = 'START';
  for (const match of code.matchAll(/\b(SELECT|FROM|JOIN|ON|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|SET|VALUES)\b/gi)) {
    clause = match[1].toUpperCase().replace(/\s+/g, ' ');
  }
  return clause;
};

const rank = (items: SqlCompletion[], partial: string) => {
  if (!partial) return items.slice(0, MAX);
  const p = partial.toLowerCase();
  const key = (item: SqlCompletion) => item.label.toLowerCase();
  const tail = (item: SqlCompletion) => key(item).split('.').pop()!;
  const starts = items.filter((i) => key(i).startsWith(p) || tail(i).startsWith(p));
  const contains = items.filter((i) => !starts.includes(i) && key(i).includes(p));
  return [...starts, ...contains].filter((i) => key(i) !== p).slice(0, MAX);
};

export const sqlCompletions = (text: string, caret: number, schema: Schema, dialect: DialectId, sample: string): SqlCompletionResult => {
  const before = text.slice(0, caret);
  const none = { from: caret, to: caret, items: [] };
  if (insideStringOrComment(before)) return none;
  const code = codeOf(text);
  const codeBefore = code.slice(0, caret);
  const refs = tableRefs(code, schema);
  const q = (name: string) => quoteIdent(dialect, name);
  const columnDetail = (column: Column) => displayType(dialect, column);

  // The word being typed, maybe after "alias.".
  const word = /(?:(\b[A-Za-z_][A-Za-z0-9_]*)\.)?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(codeBefore)!;
  const qualifier = word[1];
  const partial = word[2] ?? '';
  const from = caret - partial.length;
  // What the word ends at, so accepting in the middle of a word replaces all of it.
  const to = caret + (/^[A-Za-z0-9_]*/.exec(text.slice(caret))?.[0].length ?? 0);
  const head = codeBefore.slice(0, codeBefore.length - partial.length - (qualifier ? qualifier.length + 1 : 0));
  const prev = /([A-Za-z_][A-Za-z0-9_]*|[,(=<>!]+)\s*$/.exec(head)?.[1]?.toUpperCase() ?? '';
  const result = (items: SqlCompletion[]) => ({ from, to, items: rank(items, partial) });

  const keyword = (label: string): SqlCompletion => ({ label, insert: `${label} `, kind: 'keyword' });

  // After AS the person is naming something: nothing to suggest.
  if (prev === 'AS') return none;

  // The text without the word being typed, so it does not count as already written.
  const wordStart = from - (qualifier ? qualifier.length + 1 : 0);
  const rest = `${code.slice(0, wordStart)} ${code.slice(to)}`;

  /** "qualifier.column" pairs written anywhere in the query, by qualifier. */
  const qualified = new Map<string, Set<string>>();
  for (const m of rest.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const key = m[1].toLowerCase();
    if (!qualified.has(key)) qualified.set(key, new Set());
    qualified.get(key)!.add(m[2].toLowerCase());
  }

  /** Columns already in the SELECT list the cursor is in, so they are not offered twice. */
  const selectStart = [...codeBefore.matchAll(/\bSELECT\b/gi)].pop()?.index;
  const usedInSelect = new Set<string>();
  if (selectStart !== undefined) {
    const fromAfter = /\bFROM\b/i.exec(code.slice(selectStart));
    const end = fromAfter ? selectStart + fromAfter.index : code.length;
    const list = `${code.slice(selectStart + 6, Math.max(selectStart + 6, wordStart))} ${code.slice(Math.min(to, end), end)}`;
    for (const m of list.matchAll(/(?:\b([A-Za-z_][A-Za-z0-9_]*)\.)?\b([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g)) {
      usedInSelect.add(m[1] ? `${m[1]}.${m[2]}`.toLowerCase() : m[2].toLowerCase());
    }
  }
  const alreadySelected = (qualifierName: string | undefined, table: Table, column: Column) => {
    const col = column.name.toLowerCase();
    if (!qualifierName) return usedInSelect.has(col);
    return usedInSelect.has(`${qualifierName.toLowerCase()}.${col}`) || usedInSelect.has(`${table.name.toLowerCase()}.${col}`);
  };

  /**
   * Tables the query already points at through "x.column": by name (cliente.id) or by an alias
   * not declared yet (c.id), which goes to the table that has all the columns used with it.
   */
  const declared = new Set(refs.map((r) => (r.alias ?? r.table.name).toLowerCase()));
  const wanted: { table: Table; alias?: string }[] = [];
  for (const [name, columns] of qualified) {
    if (declared.has(name)) continue;
    const byName = schema.tables.find((t) => t.name.toLowerCase() === name);
    if (byName) {
      wanted.push({ table: byName });
      continue;
    }
    const fits = schema.tables.filter((t) => [...columns].every((c) => t.columns.some((col) => col.name.toLowerCase() === c)));
    const best = fits.find((t) => t.name.toLowerCase().startsWith(name)) ?? fits.find((t) => t.name.toLowerCase()[0] === name[0]) ?? fits[0];
    if (best) wanted.push({ table: best, alias: name });
  }
  const inSelect = clauseAt(codeBefore) === 'SELECT';
  const columnsOf = (ref: TableRef, qualify: boolean): SqlCompletion[] =>
    ref.table.columns
      .filter((c) => !inSelect || !alreadySelected(qualify ? (ref.alias ?? ref.table.name) : undefined, ref.table, c))
      .map((c) => ({
      label: qualify ? `${ref.alias ?? ref.table.name}.${c.name}` : c.name,
      insert: qualify ? `${ref.alias ?? q(ref.table.name)}.${q(c.name)}` : q(c.name),
      kind: 'column',
      detail: columnDetail(c),
    }));
  const queryColumns = () => {
    // With one table and no alias, plain names; otherwise alias.column so they never clash.
    const qualify = refs.length > 1 || refs.some((r) => r.alias);
    return refs.flatMap((r) => columnsOf(r, qualify));
  };
  const functions = (): SqlCompletion[] => FUNCTIONS.map((f) => ({ label: `${f}()`, insert: `${f}(`, kind: 'function' }));
  /**
   * Tables for FROM or JOIN, best first: the ones the query already uses through "x.column" (with
   * the alias it uses), then, after a JOIN, the ones related by a foreign key, then the rest; the
   * tables already in FROM go last.
   */
  const tables = (joining: boolean): SqlCompletion[] => {
    const items: SqlCompletion[] = [];
    const seen = new Set<string>();
    const add = (table: Table, alias?: string) => {
      const key = `${table.id}:${alias ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label: alias ? `${table.name} ${alias}` : table.name, insert: `${q(table.name)}${alias ? ` ${alias}` : ''} `, kind: 'table' });
    };
    const inQuery = new Set(refs.map((r) => r.table.id));
    for (const w of wanted) if (!inQuery.has(w.table.id)) add(w.table, w.alias);
    if (joining) {
      for (const fk of schema.foreignKeys) {
        if (inQuery.has(fk.refTableId) && !inQuery.has(fk.tableId)) add(schema.tables.find((t) => t.id === fk.tableId)!);
        if (inQuery.has(fk.tableId) && !inQuery.has(fk.refTableId)) add(schema.tables.find((t) => t.id === fk.refTableId)!);
      }
    }
    // A table already offered with the alias the query uses is not offered again without it.
    const withAlias = new Set(items.map((i) => i.label.split(' ')[0]));
    for (const table of schema.tables) if (!inQuery.has(table.id) && !withAlias.has(table.name)) add(table);
    for (const table of schema.tables) if (inQuery.has(table.id)) add(table);
    return items;
  };

  // "alias." or "table.": that table's columns.
  if (qualifier) {
    const ref = refs.find((r) => (r.alias ?? r.table.name).toLowerCase() === qualifier.toLowerCase()) ??
      refs.find((r) => r.table.name.toLowerCase() === qualifier.toLowerCase());
    const table = ref?.table ?? schema.tables.find((t) => t.name.toLowerCase() === qualifier.toLowerCase());
    if (!table) return none;
    return result(
      table.columns
        .filter((c) => !inSelect || !alreadySelected(qualifier, table, c))
        .map((c) => ({ label: c.name, insert: q(c.name), kind: 'column', detail: columnDetail(c) })),
    );
  }

  // After FROM, JOIN or a comma in FROM: the tables.
  const clause = clauseAt(codeBefore);
  if (prev === 'FROM' || prev === 'JOIN' || (prev === ',' && clause === 'FROM')) return result(tables(prev !== 'FROM'));

  // Right after "JOIN table [alias]" or after ON: the join conditions from the foreign keys.
  const joined = new RegExp(String.raw`\bJOIN\s+(${IDENT})(?:\s+(?:AS\s+)?(${IDENT}))?\s+(ON\s+)?$`, 'i').exec(head);
  if (joined || prev === 'ON') {
    const target = joined ? refs.find((r) => r.table.name.toLowerCase() === unquote(joined[1]).toLowerCase()) : refs[refs.length - 1];
    const conditions: SqlCompletion[] = [];
    if (target) {
      const name = (ref: TableRef) => ref.alias ?? q(ref.table.name);
      for (const other of refs) {
        if (other === target) continue;
        for (const fk of schema.foreignKeys) {
          const pair =
            fk.tableId === target.table.id && fk.refTableId === other.table.id
              ? [target, other]
              : fk.tableId === other.table.id && fk.refTableId === target.table.id
                ? [other, target]
                : null;
          if (!pair) continue;
          const [holder, referenced] = pair;
          const condition = fk.columnIds
            .map((id, i) => {
              const a = holder.table.columns.find((c) => c.id === id)?.name ?? '?';
              const b = referenced.table.columns.find((c) => c.id === fk.refColumnIds[i])?.name ?? '?';
              return `${name(holder)}.${q(a)} = ${name(referenced)}.${q(b)}`;
            })
            .join(' AND ');
          const withOn = joined && !joined[3] ? `ON ${condition}` : condition;
          conditions.push({ label: withOn, insert: `${withOn} `, kind: 'join', detail: fk.name });
        }
      }
    }
    if (joined && !joined[3]) return result([...conditions, keyword('ON'), keyword('AS')]);
    return result([...conditions, ...queryColumns()]);
  }

  // After a column in WHERE, ON or HAVING: operators that fit its type.
  if (['WHERE', 'ON', 'HAVING'].includes(clause) && !partial) {
    const last = new RegExp(String.raw`(?:(${IDENT})\.)?(${IDENT})\s+$`).exec(head);
    if (last && !CLAUSE_KEYWORDS.includes(last[2].toUpperCase())) {
      const owner = last[1]
        ? refs.find((r) => (r.alias ?? r.table.name).toLowerCase() === unquote(last[1]).toLowerCase())
        : refs.find((r) => r.table.columns.some((c) => c.name.toLowerCase() === unquote(last[2]).toLowerCase()));
      const column = owner?.table.columns.find((c) => c.name.toLowerCase() === unquote(last[2]).toLowerCase());
      if (column) {
        return {
          from,
          to,
          items: operatorsFor(dialect, column, sample).map((o) => ({ label: o.op, insert: `${o.op} `, kind: 'operator' as const, meaning: o.meaning, detail: o.detail })),
        };
      }
    }
  }

  switch (clause) {
    case 'START':
      return result(['SELECT', 'WITH'].map(keyword));
    case 'SELECT': {
      const items = [...queryColumns(), ...functions(), keyword('DISTINCT'), keyword('FROM'), keyword('AS'), keyword('CASE')];
      // No FROM yet: every table's columns, the tables already used in the list first.
      if (!refs.length) {
        const used = wanted.map((w) => w.table);
        const order = [...used, ...schema.tables.filter((t) => !used.includes(t))];
        items.unshift(...order.flatMap((t) => columnsOf({ table: t, alias: wanted.find((w) => w.table === t)?.alias }, true)));
      }
      if (!partial && head.trimEnd().toUpperCase().endsWith('SELECT')) items.unshift({ label: '*', insert: '* ', kind: 'column' });
      return result(items);
    }
    case 'FROM':
    case 'JOIN':
      return result(['JOIN', 'LEFT JOIN', 'INNER JOIN', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'AS'].map(keyword));
    case 'WHERE':
    case 'ON':
    case 'HAVING': {
      // After a complete condition ("... = 'x' ", "... > 10 ", "... IS NULL "): what joins or ends it.
      const complete = /('(?:[^']|'')*'|\b\d+(?:\.\d+)?|\)|\bNULL|\bTRUE|\bFALSE)\s+$/i.test(before.slice(0, before.length - partial.length));
      const connectors = ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'LIMIT'].map(keyword);
      if (complete) return result([...connectors, ...queryColumns()]);
      return result([...queryColumns(), ...functions(), ...['AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'EXISTS', 'GROUP BY', 'ORDER BY', 'LIMIT'].map(keyword)]);
    }
    case 'GROUP BY':
    case 'ORDER BY':
      return result([...queryColumns(), ...functions(), ...['ASC', 'DESC', 'HAVING', 'LIMIT'].map(keyword)]);
    default:
      return result(CLAUSE_KEYWORDS.map(keyword));
  }
};
