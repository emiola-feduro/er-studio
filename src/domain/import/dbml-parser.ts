import type { DialectId } from '../types';
import { baseName, emptyColumn, emptyIr, emptyTable, type Ir, type IrIndex, type IrTable } from './ir';

/**
 * Reads DBML (dbdiagram.io): Project, Table with column settings and an indexes block, Ref (inline,
 * short and long form, composite keys and the four relation symbols) and Enum. Notes, TableGroup and
 * TablePartial are skipped.
 */

const DATABASE_TYPES: Record<string, DialectId> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mysql',
  sqlite: 'sqlite',
  sqlserver: 'sqlserver',
  'sql server': 'sqlserver',
  mssql: 'sqlserver',
  oracle: 'oracle',
};

/** Removes // and /* *\/ comments outside quotes. */
const stripComments = (text: string) => {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = text.startsWith("'''", i) ? "'''" : c;
      if (quote === "'''") {
        const end = text.indexOf("'''", i + 3);
        out += text.slice(i, end < 0 ? text.length : end + 3);
        i = end < 0 ? text.length : end + 2;
        quote = null;
        continue;
      }
      out += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    out += c;
  }
  return out;
};

const unquote = (name: string) => name.trim().replace(/^["'`](.*)["'`]$/s, '$1');

/** Splits by a separator outside quotes, brackets and parentheses. */
const splitTop = (text: string, separator: string) => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = null;
      current += c;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (depth === 0 && c === separator) {
      parts.push(current);
      current = '';
    } else current += c;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
};

/** Top level blocks: keyword, header text and body between the matching braces. */
const blocks = (text: string) => {
  const found: { keyword: string; header: string; body: string }[] = [];
  const re = /(^|\n)\s*(Project|Table|Ref|Enum|TableGroup|TablePartial|Note|Records)\b([^{\n]*)\{/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    let depth = 1;
    let i = re.lastIndex;
    let quote: string | null = null;
    for (; i < text.length && depth > 0; i += 1) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
    }
    found.push({ keyword: match[2].toLowerCase(), header: match[3].trim(), body: text.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return found;
};

/** Settings list "[pk, not null, default: 'x', ref: > a.b]" as lower-case keys and raw values. */
const settings = (text: string | undefined) => {
  const map = new Map<string, string>();
  if (!text) return map;
  for (const part of splitTop(text, ',')) {
    const colon = part.indexOf(':');
    if (colon > 0 && !/^(not\s+null|primary\s+key)$/i.test(part)) map.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim());
    else map.set(part.trim().toLowerCase().replace(/\s+/g, ' '), '');
  }
  return map;
};

/** Endpoint "schema.table.column" or "table.(a, b)". */
const endpoint = (text: string) => {
  const composite = /^(.+)\.\(([^)]*)\)$/.exec(text.trim());
  if (composite) return { table: baseName(unquote(composite[1])), columns: composite[2].split(',').map((c) => unquote(c)) };
  const parts = text.trim().split('.').map(unquote);
  return { table: parts.length > 1 ? parts[parts.length - 2] : '', columns: [parts[parts.length - 1]] };
};

const defaultValue = (raw: string) => {
  const value = raw.trim();
  if (/^`.*`$/s.test(value)) return value.slice(1, -1);
  if (/^'.*'$/s.test(value) || /^".*"$/s.test(value)) return `'${value.slice(1, -1).replace(/'/g, "''")}'`;
  return value;
};

export const parseDbml = (source: string): Ir => {
  const ir = emptyIr();
  const text = stripComments(source);
  const tables = new Map<string, IrTable>();
  const enums = new Map<string, string[]>();
  const refs: string[] = [];

  for (const block of blocks(text)) {
    if (block.keyword === 'project') {
      const type = /database_type\s*:\s*['"]([^'"]+)['"]/i.exec(block.body)?.[1]?.toLowerCase();
      if (type && DATABASE_TYPES[type]) ir.dialect = DATABASE_TYPES[type];
      ir.databaseName ??= unquote(block.header) || undefined;
      continue;
    }
    if (block.keyword === 'enum') {
      const name = baseName(unquote(block.header));
      // One value per line in DBML; values with spaces are quoted, so splitting on spaces outside quotes is safe.
      const values = block.body
        .split('\n')
        .map((line) => line.replace(/\[[^\]]*\]/g, '').trim())
        .flatMap((line) => line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [])
        .map(unquote);
      enums.set(name.toLowerCase(), values);
      continue;
    }
    if (block.keyword === 'ref') {
      refs.push(...block.body.split('\n').map((line) => line.trim()).filter(Boolean));
      continue;
    }
    if (block.keyword !== 'table') {
      if (block.keyword !== 'note') ir.skipped.push(`${block.keyword} ${block.header}`.trim());
      continue;
    }

    // Header: "schema.name as alias [settings]"
    const header = block.header.replace(/\[[^\]]*\]\s*$/, '').trim();
    const name = baseName(unquote(header.split(/\s+as\s+/i)[0]));
    const table = emptyTable(name);
    tables.set(name.toLowerCase(), table);
    const alias = /\s+as\s+(\S+)/i.exec(header)?.[1];
    if (alias) tables.set(unquote(alias).toLowerCase(), table);
    ir.tables.push(table);

    // The indexes { ... } block is cut out before reading the columns.
    let body = block.body;
    const indexesMatch = /indexes\s*\{([\s\S]*?)\}/i.exec(body);
    if (indexesMatch) body = body.replace(indexesMatch[0], '');
    body = body.replace(/Note\s*:\s*('''[\s\S]*?'''|'[^']*'|"[^"]*")/gi, '').replace(/Note\s*\{[\s\S]*?\}/gi, '');

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const settingsText = /\[(.*)\]\s*$/.exec(line)?.[1];
      const definition = settingsText ? line.slice(0, line.lastIndexOf('[')).trim() : line;
      const match = /^("[^"]+"|`[^`]+`|\S+)\s+("[^"]+"|[^\s(]+(?:\s*\([^)]*\))?)/.exec(definition);
      if (!match) continue;
      const typeText = unquote(match[2]);
      const typeName = typeText.replace(/\(.*$/, '').trim();
      const params = /\(([^)]*)\)/.exec(typeText)?.[1].split(',').map((p) => p.trim()) ?? [];
      const column = emptyColumn(unquote(match[1]), typeName.toUpperCase(), params);
      const enumValues = enums.get(baseName(typeName).toLowerCase());
      if (enumValues) {
        column.type = 'ENUM';
        column.enumValues = enumValues;
      }
      const set = settings(settingsText);
      if (set.has('pk') || set.has('primary key')) column.pk = true;
      if (set.has('not null') || column.pk) column.notNull = true;
      if (set.has('unique')) column.unique = true;
      if (set.has('increment')) column.autoIncrement = true;
      if (set.has('default')) column.defaultValue = defaultValue(set.get('default')!);
      if (set.has('check')) column.check = set.get('check')!.replace(/^`|`$/g, '');
      for (const [key, value] of set) if (key === 'ref') refs.push(`${name}.${column.name} ${value}`);
      table.columns.push(column);
    }
    // Enum types declared after the table are resolved at the end.
    if (indexesMatch) {
      for (const raw of indexesMatch[1].split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const settingsText = /\[(.*)\]\s*$/.exec(line)?.[1];
        const target = (settingsText ? line.slice(0, line.lastIndexOf('[')) : line).trim();
        const set = settings(settingsText);
        const columns = (target.startsWith('(') ? splitTop(target.slice(1, -1), ',') : [target]).map((c) => ({ name: unquote(c), order: 'ASC' as const }));
        if (columns.some((c) => c.name.startsWith('`'))) {
          ir.skipped.push(`index ${target}`);
          continue;
        }
        if (set.has('pk')) {
          table.pk = { columns: columns.map((c) => c.name) };
          continue;
        }
        const index: IrIndex = { columns, unique: set.has('unique') };
        if (set.get('name')) index.name = unquote(set.get('name')!);
        if (set.get('type')) index.method = unquote(set.get('type')!);
        table.indexes.push(index);
      }
    }
  }

  // Short form refs written at the top level: "Ref name: a.b > c.d [delete: cascade]".
  for (const match of text.matchAll(/(^|\n)\s*Ref\b[^:{\n]*:\s*([^\n]+)/gi)) refs.push(match[2].trim());

  for (const ref of refs) {
    const settingsText = /\[(.*)\]\s*$/.exec(ref)?.[1];
    const body = (settingsText ? ref.slice(0, ref.lastIndexOf('[')) : ref).trim();
    const match = /^(.+?)\s*(<>|<|>|-)\s*(.+)$/.exec(body);
    if (!match) continue;
    const left = endpoint(match[1]);
    const right = endpoint(match[3]);
    const set = settings(settingsText);
    const actions = { onDelete: set.get('delete')?.toUpperCase(), onUpdate: set.get('update')?.toUpperCase() };
    const symbol = match[2];
    if (symbol === '<>') {
      ir.manyToMany.push({ tableA: left.table, columnsA: left.columns, tableB: right.table, columnsB: right.columns });
      continue;
    }
    // ">" many-to-one: the left side holds the FK; "<" one-to-many: the right side does; "-" one-to-one: the left side.
    const [holder, target] = symbol === '<' ? [right, left] : [left, right];
    const table = tables.get(holder.table.toLowerCase());
    if (!table) continue;
    table.foreignKeys.push({ columns: holder.columns, refTable: tables.get(target.table.toLowerCase())?.name ?? target.table, refColumns: target.columns, ...actions });
    if (symbol === '-' && holder.columns.length === 1) {
      const column = table.columns.find((c) => c.name === holder.columns[0]);
      if (column) column.unique = true;
    }
  }

  for (const table of ir.tables) {
    for (const column of table.columns) {
      const values = enums.get(column.type.toLowerCase());
      if (values) {
        column.type = 'ENUM';
        column.enumValues = values;
      }
    }
  }
  return ir;
};
