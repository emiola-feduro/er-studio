import { quoteIdent, RESERVED_WORDS } from './dialects';
import type { Column, DialectId, ForeignKey, Schema, Table } from './types';

/**
 * Builds a SELECT across the chosen tables, joining them through the foreign keys. When two chosen
 * tables are not directly related, the tables in between (a junction, for example) are joined too.
 */

export type JoinType = 'INNER' | 'LEFT';

export type QuerySpec = {
  /** Tables in the order they were chosen; the first one goes in FROM. */
  tableIds: string[];
  /** Join type per joined table id; INNER by default, LEFT when the FK accepts NULL. */
  joinTypes?: Record<string, JoinType>;
  /** Selected column ids per table; a table missing here selects all its columns. */
  columns?: Record<string, string[]>;
  where?: string;
  orderBy?: { tableId: string; columnId: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
  distinct?: boolean;
  /** Aliases typed by the person, per table id; the others are made from the initials. */
  aliases?: Record<string, string>;
};

export type JoinStep = {
  tableId: string;
  alias: string;
  fk: ForeignKey;
  /** Pairs of qualified columns compared in ON. */
  on: [string, string][];
  type: JoinType;
  /** Added to connect two chosen tables; it adds no columns to the result. */
  bridge: boolean;
};

export type AliasProblem = 'invalid' | 'reserved' | 'duplicate';

export type QueryPlan = {
  base?: { tableId: string; alias: string };
  joins: JoinStep[];
  unreachable: string[];
  aliases: Record<string, string>;
  /** Typed aliases that could not be used, so the automatic one took their place. */
  aliasProblems: Record<string, AliasProblem>;
};

const ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a typed alias cannot be used, if it cannot. */
export const aliasProblem = (alias: string, taken: Set<string>): AliasProblem | undefined => {
  if (!ALIAS.test(alias)) return 'invalid';
  if (RESERVED_WORDS.has(alias.toUpperCase())) return 'reserved';
  if (taken.has(alias.toLowerCase())) return 'duplicate';
  return undefined;
};

/**
 * Aliases for the tables of the query: the typed ones when they can be used, else a short one from
 * the initials of the table name (pedidos_productos → pp), unique and not a SQL word.
 */
const makeAliases = (tables: Table[], typed: Record<string, string> = {}) => {
  const aliases: Record<string, string> = {};
  const problems: Record<string, AliasProblem> = {};
  const used = new Set<string>();
  for (const table of tables) {
    const alias = typed[table.id]?.trim();
    if (!alias) continue;
    const problem = aliasProblem(alias, used);
    if (problem) problems[table.id] = problem;
    else {
      aliases[table.id] = alias;
      used.add(alias.toLowerCase());
    }
  }
  for (const table of tables) {
    if (aliases[table.id]) continue;
    const parts = table.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    let base = parts.length > 1 ? parts.map((p) => p[0]).join('') : (parts[0] ?? 't').slice(0, 2);
    if (!/^[a-z]/.test(base)) base = `t${base}`;
    let alias = base;
    for (let i = 2; used.has(alias) || RESERVED_WORDS.has(alias.toUpperCase()); i += 1) alias = `${base}${i}`;
    used.add(alias);
    aliases[table.id] = alias;
  }
  return { aliases, problems };
};

/**
 * Applies alias changes (old → new) to an expression all at once, so swaps work, and leaves quoted
 * strings alone: "cl.nombre = 'cl.x'" with cl → c gives "c.nombre = 'cl.x'".
 */
export const renameAliases = (expression: string, renames: Record<string, string>) => {
  const changes = Object.entries(renames).filter(([from, to]) => from && to && from !== to);
  if (!changes.length) return expression;
  const lookup = new Map(changes.map(([from, to]) => [from.toLowerCase(), to]));
  const names = changes.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`('(?:[^']|'')*')|\\b(${names})\\.`, 'gi');
  return expression.replace(pattern, (match, quoted: string | undefined, name: string | undefined) =>
    quoted || !name ? match : `${lookup.get(name.toLowerCase())}.`,
  );
};

/** Shortest chain of foreign keys from any table already joined to the target. */
const findPath = (schema: Schema, joined: Set<string>, target: string): ForeignKey[] | null => {
  const previous = new Map<string, { from: string; fk: ForeignKey }>();
  const queue = [...joined];
  const seen = new Set(joined);
  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) break;
    for (const fk of schema.foreignKeys) {
      if (fk.tableId === fk.refTableId) continue;
      const next = fk.tableId === current ? fk.refTableId : fk.refTableId === current ? fk.tableId : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      previous.set(next, { from: current, fk });
      queue.push(next);
    }
  }
  if (!seen.has(target)) return null;
  const path: ForeignKey[] = [];
  for (let node = target; !joined.has(node); node = previous.get(node)!.from) path.unshift(previous.get(node)!.fk);
  return path;
};

export const planJoins = (schema: Schema, spec: QuerySpec, dialect: DialectId): QueryPlan => {
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const chosen = spec.tableIds.filter((id) => tables.has(id));
  const plan: QueryPlan = { joins: [], unreachable: [], aliases: {}, aliasProblems: {} };
  if (chosen.length === 0) return plan;

  const joined = new Set([chosen[0]]);
  const steps: { tableId: string; fk: ForeignKey; from: string }[] = [];
  for (const target of chosen.slice(1)) {
    if (joined.has(target)) continue;
    const path = findPath(schema, joined, target);
    if (!path) {
      plan.unreachable.push(tables.get(target)!.name);
      continue;
    }
    for (const fk of path) {
      const next = joined.has(fk.tableId) ? fk.refTableId : fk.tableId;
      steps.push({ tableId: next, fk, from: joined.has(fk.tableId) ? fk.tableId : fk.refTableId });
      joined.add(next);
    }
  }

  const involved = [chosen[0], ...steps.map((s) => s.tableId)].map((id) => tables.get(id)!);
  const made = makeAliases(involved, spec.aliases);
  plan.aliases = made.aliases;
  plan.aliasProblems = made.problems;
  const q = (tableId: string, columnId: string) => {
    const table = tables.get(tableId)!;
    return `${plan.aliases[tableId]}.${quoteIdent(dialect, table.columns.find((c) => c.id === columnId)?.name ?? '?')}`;
  };
  plan.base = { tableId: chosen[0], alias: plan.aliases[chosen[0]] };
  plan.joins = steps.map(({ tableId, fk }) => {
    const holder = fk.tableId;
    const optional = fk.columnIds.every((id) => tables.get(holder)?.columns.find((c) => c.id === id)?.nullable);
    return {
      tableId,
      alias: plan.aliases[tableId],
      fk,
      on: fk.columnIds.map((id, i) => [q(holder, id), q(fk.refTableId, fk.refColumnIds[i])] as [string, string]),
      type: spec.joinTypes?.[tableId] ?? (optional ? 'LEFT' : 'INNER'),
      bridge: !chosen.includes(tableId),
    };
  });
  return plan;
};

export type BuiltQuery = { sql: string; plan: QueryPlan };

export const buildSelect = (schema: Schema, dialect: DialectId, spec: QuerySpec): BuiltQuery => {
  const plan = planJoins(schema, spec, dialect);
  if (!plan.base) return { sql: '', plan };
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const ident = (name: string) => quoteIdent(dialect, name);

  // Selected columns of the chosen tables; a name used by several tables gets an alias like cliente_nombre.
  const selected: { table: Table; column: Column }[] = [];
  for (const tableId of [plan.base.tableId, ...plan.joins.filter((j) => !j.bridge).map((j) => j.tableId)]) {
    const table = tables.get(tableId)!;
    const ids = spec.columns?.[tableId];
    for (const column of table.columns) if (!ids || ids.includes(column.id)) selected.push({ table, column });
  }
  const counts = new Map<string, number>();
  for (const { column } of selected) counts.set(column.name.toLowerCase(), (counts.get(column.name.toLowerCase()) ?? 0) + 1);
  const columnList = selected.length
    ? selected
        .map(({ table, column }) => {
          const expr = `${plan.aliases[table.id]}.${ident(column.name)}`;
          return (counts.get(column.name.toLowerCase()) ?? 0) > 1 ? `${expr} AS ${ident(`${table.name}_${column.name}`)}` : expr;
        })
        .join(',\n  ')
    : '*';

  const limit = spec.limit && spec.limit > 0 ? Math.floor(spec.limit) : undefined;
  const head = `SELECT ${spec.distinct ? 'DISTINCT ' : ''}${limit && dialect === 'sqlserver' ? `TOP (${limit}) ` : ''}`;
  const lines = [`${head}\n  ${columnList}`, `FROM ${ident(tables.get(plan.base.tableId)!.name)} ${plan.base.alias}`];
  for (const join of plan.joins) {
    const conditions = join.on.map(([a, b]) => `${a} = ${b}`).join(' AND ');
    lines.push(`${join.type === 'LEFT' ? 'LEFT JOIN' : 'JOIN'} ${ident(tables.get(join.tableId)!.name)} ${join.alias} ON ${conditions}`);
  }
  // A WHERE written on several lines keeps them, indented under WHERE.
  if (spec.where?.trim()) lines.push(`WHERE ${spec.where.trim().split(/\s*\n\s*/).join('\n  ')}`);
  const order = (spec.orderBy ?? []).filter((o) => plan.aliases[o.tableId]);
  if (order.length) {
    lines.push(`ORDER BY ${order.map((o) => `${plan.aliases[o.tableId]}.${ident(tables.get(o.tableId)!.columns.find((c) => c.id === o.columnId)?.name ?? '?')} ${o.direction}`).join(', ')}`);
  }
  if (limit && dialect === 'oracle') lines.push(`FETCH FIRST ${limit} ROWS ONLY`);
  else if (limit && dialect !== 'sqlserver') lines.push(`LIMIT ${limit}`);
  return { sql: `${lines.join('\n')};\n`, plan };
};
