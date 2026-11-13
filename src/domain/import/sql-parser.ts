import { baseName, emptyColumn, emptyIr, emptyTable, type Ir, type IrColumn, type IrIndex, type IrTable } from './ir';

/**
 * Reads CREATE TABLE, CREATE INDEX, CREATE TYPE ... AS ENUM and ALTER TABLE ... ADD statements of
 * PostgreSQL, MySQL/MariaDB, SQLite, SQL Server and Oracle into the intermediate representation.
 * Everything else (INSERT, SET, GRANT, comments) is skipped.
 */

type Token = { kind: 'word' | 'ident' | 'string' | 'number' | 'punct'; text: string };

/** Splits SQL into tokens, dropping comments. Quoted identifiers ("x", `x`, [x]) keep their exact text. */
export const tokenize = (sql: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
    } else if (c === '#' && (i === 0 || sql[i - 1] === '\n')) {
      while (i < sql.length && sql[i] !== '\n') i += 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (c === '\\' && (i === 0 || sql[i - 1] === '\n')) {
      // psql meta commands such as \connect: up to the end of the line.
      while (i < sql.length && sql[i] !== '\n') i += 1;
      tokens.push({ kind: 'punct', text: ';' });
    } else if (c === "'" || ((c === 'N' || c === 'n') && sql[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      let text = '';
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          text += "'";
          j += 2;
        } else if (sql[j] === "'") break;
        else text += sql[j++];
      }
      tokens.push({ kind: 'string', text });
      i = j + 1;
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      const end = sql.indexOf(close, i + 1);
      tokens.push({ kind: 'ident', text: sql.slice(i + 1, end < 0 ? sql.length : end) });
      i = end < 0 ? sql.length : end + 1;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const match = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(sql.slice(i))!;
      tokens.push({ kind: 'number', text: match[0] });
      i += match[0].length;
    } else if (/[A-Za-z_À-ɏ$@]/.test(c)) {
      const match = /^[A-Za-z_À-ɏ$@][A-Za-z0-9_À-ɏ$#@]*/.exec(sql.slice(i))!;
      tokens.push({ kind: 'word', text: match[0] });
      i += match[0].length;
    } else {
      const two = sql.slice(i, i + 2);
      if (['::', '<>', '!=', '<=', '>=', '||'].includes(two)) {
        tokens.push({ kind: 'punct', text: two });
        i += 2;
      } else {
        tokens.push({ kind: 'punct', text: c });
        i += 1;
      }
    }
  }
  return tokens;
};

/** Statements separated by ";" or by GO (SQL Server batches). */
const statements = (tokens: Token[]) => {
  const list: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'punct' && token.text === '(') depth += 1;
    if (token.kind === 'punct' && token.text === ')') depth -= 1;
    const separator = (token.kind === 'punct' && token.text === ';') || (token.kind === 'word' && token.text.toUpperCase() === 'GO' && depth <= 0);
    if (separator) {
      if (current.length) list.push(current);
      current = [];
      depth = 0;
    } else current.push(token);
  }
  if (current.length) list.push(current);
  return list;
};

/** SQL words that keep a space before "(", unlike function names. */
const SPACED = new Set(['IN', 'AND', 'OR', 'NOT', 'ON', 'AS', 'BETWEEN', 'EXISTS', 'VALUES', 'CHECK', 'WHEN', 'THEN', 'ELSE', 'IS']);

/** Rebuilds readable SQL from tokens, for defaults, checks and WHERE clauses. */
const render = (tokens: Token[]) =>
  tokens.reduce((out, token, i) => {
    const prev = tokens[i - 1];
    const text =
      token.kind === 'string'
        ? `'${token.text.replace(/'/g, "''")}'`
        : token.kind === 'ident' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(token.text)
          ? `"${token.text}"`
          : token.text;
    const tight =
      !prev ||
      (prev.kind === 'punct' && ['(', '.', '::'].includes(prev.text)) ||
      (token.kind === 'punct' && [')', ',', '.', '::'].includes(token.text)) ||
      (token.kind === 'punct' && token.text === '(' && (prev.kind === 'ident' || (prev.kind === 'word' && !SPACED.has(prev.text.toUpperCase()))));
    return out + (tight ? '' : ' ') + text;
  }, '');

class Cursor {
  constructor(
    private tokens: Token[],
    public i = 0,
  ) {}
  peek(offset = 0) {
    return this.tokens[this.i + offset];
  }
  done() {
    return this.i >= this.tokens.length;
  }
  next() {
    return this.tokens[this.i++];
  }
  /** True when the next tokens are these keywords (case-insensitive); consumes them. */
  accept(...words: string[]) {
    for (let k = 0; k < words.length; k += 1) {
      const token = this.peek(k);
      if (!token || token.kind !== 'word' || token.text.toUpperCase() !== words[k]) return false;
    }
    this.i += words.length;
    return true;
  }
  is(...words: string[]) {
    const token = this.peek();
    return Boolean(token && token.kind === 'word' && words.includes(token.text.toUpperCase()));
  }
  punct(text: string) {
    if (this.peek()?.text === text && this.peek()?.kind === 'punct') {
      this.i += 1;
      return true;
    }
    return false;
  }
  /** A possibly qualified name (schema.table); returns the last part. */
  name() {
    let name = this.next()?.text ?? '';
    while (this.peek()?.text === '.' && this.peek(1)) {
      this.i += 1;
      name = `${name}.${this.next().text}`;
    }
    return baseName(name);
  }
  /** Tokens of a balanced parenthesized group, without the outer parentheses. */
  group(): Token[] {
    if (!this.punct('(')) return [];
    const start = this.i;
    let depth = 1;
    while (!this.done()) {
      const token = this.next();
      if (token.kind === 'punct' && token.text === '(') depth += 1;
      if (token.kind === 'punct' && token.text === ')') depth -= 1;
      if (depth === 0) return this.tokens.slice(start, this.i - 1);
    }
    return this.tokens.slice(start);
  }
  /** Tokens up to the next top-level token that is one of these keywords (or the end). */
  until(stop: (token: Token) => boolean): Token[] {
    const start = this.i;
    let depth = 0;
    while (!this.done()) {
      const token = this.peek();
      if (depth === 0 && stop(token)) break;
      if (token.text === '(') depth += 1;
      if (token.text === ')') depth -= 1;
      this.i += 1;
    }
    return this.tokens.slice(start, this.i);
  }
}

/** Splits tokens by top-level commas. */
const splitCommas = (tokens: Token[]) => {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.text === '(') depth += 1;
    if (token.text === ')') depth -= 1;
    if (depth === 0 && token.kind === 'punct' && token.text === ',') {
      parts.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) parts.push(current);
  return parts;
};

const columnNames = (tokens: Token[]) =>
  splitCommas(tokens).map((part) => {
    const c = new Cursor(part);
    return { name: c.name(), order: (c.is('DESC') ? 'DESC' : 'ASC') as 'ASC' | 'DESC' };
  });

/** Continuation words of types written with several words. */
const TYPE_TAIL = new Set(['PRECISION', 'VARYING', 'WITH', 'WITHOUT', 'TIME', 'ZONE', 'LOCAL', 'DAY', 'TO', 'SECOND', 'YEAR', 'MONTH', 'UNSIGNED', 'ZEROFILL', 'SIGNED']);

const readType = (c: Cursor) => {
  const words = [c.next().text];
  const params: string[] = [];
  let enumValues: string[] | undefined;
  for (;;) {
    if (c.peek()?.text === '(' && c.peek()?.kind === 'punct') {
      const inner = c.group();
      const values = splitCommas(inner).map((part) => (part[0]?.kind === 'string' ? part[0].text : render(part)));
      if (words[0].toUpperCase() === 'ENUM' || words[0].toUpperCase() === 'SET') enumValues = values;
      else params.push(...values);
      continue;
    }
    if (c.peek()?.kind === 'word' && TYPE_TAIL.has(c.peek()!.text.toUpperCase())) {
      const word = c.next().text.toUpperCase();
      if (!['UNSIGNED', 'ZEROFILL', 'SIGNED'].includes(word)) words.push(word);
      continue;
    }
    if (c.peek()?.text === '[' || (c.peek()?.kind === 'ident' && c.peek()!.text === '')) {
      c.next();
      continue;
    }
    break;
  }
  return { type: words.join(' ').toUpperCase(), params, enumValues };
};

const ACTIONS = ['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'NO ACTION'];

const readReferences = (c: Cursor) => {
  const refTable = c.name();
  const refColumns = c.peek()?.text === '(' ? columnNames(c.group()).map((x) => x.name) : [];
  let onDelete: string | undefined;
  let onUpdate: string | undefined;
  for (;;) {
    if (c.accept('ON', 'DELETE')) onDelete = readAction(c);
    else if (c.accept('ON', 'UPDATE')) onUpdate = readAction(c);
    else if (c.accept('MATCH', 'FULL') || c.accept('MATCH', 'SIMPLE') || c.accept('DEFERRABLE') || c.accept('NOT', 'DEFERRABLE') || c.accept('INITIALLY', 'DEFERRED') || c.accept('INITIALLY', 'IMMEDIATE')) continue;
    else break;
  }
  return { refTable, refColumns, onDelete, onUpdate };
};

const readAction = (c: Cursor) => {
  for (const action of ACTIONS) if (c.accept(...action.split(' '))) return action;
  c.next();
  return undefined;
};

/** Keywords that end a DEFAULT expression inside a column definition. */
const COLUMN_KEYWORDS = new Set(['NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'CHECK', 'REFERENCES', 'CONSTRAINT', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY', 'GENERATED', 'COMMENT', 'COLLATE', 'ON', 'CHARACTER', 'CHARSET']);

const readColumn = (tokens: Token[], table: IrTable) => {
  const c = new Cursor(tokens);
  const name = c.name();
  if (c.done()) return;
  const { type, params, enumValues } = readType(c);
  const column: IrColumn = { ...emptyColumn(name, type, params), ...(enumValues ? { enumValues } : {}) };
  if (/^(SERIAL|BIGSERIAL|SMALLSERIAL)$/.test(type)) column.autoIncrement = true;
  while (!c.done()) {
    if (c.accept('NOT', 'NULL')) column.notNull = true;
    else if (c.accept('NULL')) column.notNull = false;
    else if (c.accept('PRIMARY', 'KEY')) {
      column.pk = true;
      column.notNull = true;
      if (c.accept('AUTOINCREMENT')) column.autoIncrement = true;
      c.accept('ASC') || c.accept('DESC');
    } else if (c.accept('UNIQUE')) {
      column.unique = true;
      c.accept('KEY');
    } else if (c.accept('AUTO_INCREMENT') || c.accept('AUTOINCREMENT')) column.autoIncrement = true;
    else if (c.accept('IDENTITY')) {
      column.autoIncrement = true;
      if (c.peek()?.text === '(') c.group();
    } else if (c.accept('GENERATED')) {
      c.accept('ALWAYS') || c.accept('BY', 'DEFAULT');
      c.accept('ON', 'NULL');
      if (c.accept('AS', 'IDENTITY')) {
        column.autoIncrement = true;
        if (c.peek()?.text === '(') c.group();
      } else if (c.accept('AS')) {
        c.group();
        c.accept('STORED') || c.accept('VIRTUAL');
      }
    } else if (c.accept('DEFAULT')) {
      const expr = c.until((t) => t.kind === 'word' && COLUMN_KEYWORDS.has(t.text.toUpperCase()));
      column.defaultValue = render(expr);
    } else if (c.accept('CHECK')) column.check = render(c.group());
    else if (c.accept('REFERENCES')) {
      const ref = readReferences(c);
      table.foreignKeys.push({ columns: [name], refTable: ref.refTable, refColumns: ref.refColumns, onDelete: ref.onDelete, onUpdate: ref.onUpdate });
    } else if (c.accept('CONSTRAINT')) c.next();
    else if (c.accept('COMMENT')) c.next();
    else if (c.accept('COLLATE')) c.next();
    else if (c.accept('CHARACTER', 'SET') || c.accept('CHARSET')) c.next();
    else if (c.accept('ON', 'UPDATE')) c.until((t) => t.kind === 'word' && COLUMN_KEYWORDS.has(t.text.toUpperCase()) && t.text.toUpperCase() !== 'ON');
    else c.next();
  }
  table.columns.push(column);
};

/** Table level constraint or index inside CREATE TABLE (or after ALTER TABLE ... ADD). */
const readConstraint = (c: Cursor, table: IrTable): boolean => {
  let name: string | undefined;
  if (c.accept('CONSTRAINT')) name = c.name();
  if (c.accept('PRIMARY', 'KEY')) {
    c.accept('CLUSTERED') || c.accept('NONCLUSTERED');
    table.pk = { name, columns: columnNames(c.group()).map((x) => x.name) };
    return true;
  }
  if (c.accept('UNIQUE')) {
    c.accept('KEY') || c.accept('INDEX');
    c.accept('CLUSTERED') || c.accept('NONCLUSTERED');
    if (c.peek()?.text !== '(') name = c.name();
    table.uniques.push({ name, columns: columnNames(c.group()).map((x) => x.name) });
    return true;
  }
  if (c.accept('FOREIGN', 'KEY')) {
    if (c.peek()?.text !== '(') c.name();
    const columns = columnNames(c.group()).map((x) => x.name);
    c.accept('REFERENCES');
    const ref = readReferences(c);
    table.foreignKeys.push({ name, columns, refTable: ref.refTable, refColumns: ref.refColumns, onDelete: ref.onDelete, onUpdate: ref.onUpdate });
    return true;
  }
  if (c.accept('CHECK')) {
    table.checks.push({ name, expression: render(c.group()) });
    return true;
  }
  if (!name && (c.is('KEY', 'INDEX', 'FULLTEXT', 'SPATIAL'))) {
    c.accept('FULLTEXT') || c.accept('SPATIAL');
    c.accept('KEY') || c.accept('INDEX');
    const indexName = c.peek()?.text !== '(' ? c.name() : undefined;
    table.indexes.push({ name: indexName, columns: columnNames(c.group()), unique: false });
    return true;
  }
  return false;
};

export const parseSql = (sql: string): Ir => {
  const ir = emptyIr();
  const tables = new Map<string, IrTable>();
  const enums = new Map<string, string[]>();
  const tableFor = (name: string) => {
    const key = name.toLowerCase();
    if (!tables.has(key)) {
      const table = emptyTable(name);
      tables.set(key, table);
      ir.tables.push(table);
    }
    return tables.get(key)!;
  };

  for (const tokens of statements(tokenize(sql))) {
    const c = new Cursor(tokens);
    if (c.accept('CREATE')) {
      c.accept('OR', 'REPLACE');
      c.accept('GLOBAL') || c.accept('LOCAL');
      c.accept('TEMPORARY') || c.accept('TEMP') || c.accept('UNLOGGED');
      if (c.accept('TABLE')) {
        c.accept('IF', 'NOT', 'EXISTS');
        const table = tableFor(c.name());
        for (const part of splitCommas(c.group())) {
          const item = new Cursor(part);
          if (!readConstraint(item, table)) readColumn(part, table);
        }
        continue;
      }
      if (c.accept('TYPE')) {
        const name = c.name();
        if (c.accept('AS', 'ENUM')) {
          enums.set(name.toLowerCase(), splitCommas(c.group()).map((p) => p[0]?.text ?? ''));
          continue;
        }
      }
      const unique = c.accept('UNIQUE');
      const method = c.accept('CLUSTERED') ? 'CLUSTERED' : c.accept('NONCLUSTERED') ? 'NONCLUSTERED' : c.accept('BITMAP') ? 'BITMAP' : undefined;
      if (c.accept('INDEX')) {
        c.accept('CONCURRENTLY');
        c.accept('IF', 'NOT', 'EXISTS');
        const name = c.peek()?.text.toUpperCase() === 'ON' ? undefined : c.name();
        c.accept('ON');
        c.accept('ONLY');
        const table = tableFor(c.name());
        let using = method;
        if (c.accept('USING')) using = c.next().text;
        const index: IrIndex = { name, columns: columnNames(c.group()), unique, ...(using ? { method: using } : {}) };
        if (c.accept('USING')) index.method = c.next().text;
        if (c.accept('WHERE')) index.where = render(c.until(() => false));
        table.indexes.push(index);
        continue;
      }
      if (c.accept('DATABASE') || c.accept('SCHEMA')) {
        c.accept('IF', 'NOT', 'EXISTS');
        ir.databaseName ??= c.name();
        continue;
      }
      ir.skipped.push(render(tokens.slice(0, 4)));
      continue;
    }
    if (c.accept('ALTER', 'TABLE')) {
      c.accept('ONLY');
      c.accept('IF', 'EXISTS');
      const table = tableFor(c.name());
      for (const part of splitCommas(c.until(() => false))) {
        const item = new Cursor(part);
        if (item.accept('ADD')) {
          if (!readConstraint(item, table)) {
            item.accept('COLUMN');
            readColumn(part.slice(item.i), table);
          }
        } else ir.skipped.push(`ALTER TABLE ${table.name} ${render(part.slice(0, 3))}`);
      }
      continue;
    }
    if (c.accept('USE')) {
      ir.databaseName ??= c.name();
      continue;
    }
    const first = tokens[0]?.text.toUpperCase();
    if (!['INSERT', 'SET', 'PRAGMA', 'COMMENT', 'DROP', 'GRANT', 'BEGIN', 'COMMIT', 'START', 'SELECT', 'UPDATE', 'DELETE', 'LOCK', 'UNLOCK', 'EXEC', 'DECLARE', 'PRINT', 'IF', 'CONNECT'].includes(first ?? '')) {
      ir.skipped.push(render(tokens.slice(0, 4)));
    }
  }

  // Columns typed with a CREATE TYPE ... AS ENUM name become ENUM columns.
  for (const table of ir.tables) {
    for (const column of table.columns) {
      const values = enums.get(column.type.toLowerCase()) ?? enums.get(baseName(column.type).toLowerCase());
      if (values) {
        column.type = 'ENUM';
        column.enumValues = values;
      }
    }
  }
  return ir;
};
