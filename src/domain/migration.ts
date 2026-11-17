import { t } from '../i18n';
import { columnDefinition, createIndex, createTable, fkClause, sortTables } from './ddl';
import { ddlType, DIALECTS, isEnum, quoteIdent, quoteLiteral } from './dialects';
import type { Column, DialectId, ForeignKey, Schema, Table, TableIndex } from './types';

/**
 * Migration between two versions of a model: the ALTER statements that turn the old schema into the
 * new one instead of recreating everything. Tables, columns, FKs and indexes are matched by their
 * stable ids, so a rename is a rename and not a drop plus a create.
 */

export type ChangeKind =
  | 'createTable'
  | 'dropTable'
  | 'renameTable'
  | 'addColumn'
  | 'dropColumn'
  | 'renameColumn'
  | 'alterColumn'
  | 'changePk'
  | 'addFk'
  | 'dropFk'
  | 'addUnique'
  | 'dropUnique'
  | 'addIndex'
  | 'dropIndex'
  | 'rebuildTable';

export type Change = { kind: ChangeKind; table: string; detail?: string; destructive?: boolean };
export type Migration = { sql: string; changes: Change[]; warnings: string[] };

/** `raw` checks are written as they are; the others start with the column name, quoted on output. */
type Constraint = { name: string; columnIds: string[]; check?: string; raw?: boolean };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** UNIQUE and named CHECK constraints of a table, as the DDL generator writes them. */
const constraintsOf = (table: Table) => {
  const uniques: Constraint[] = [
    ...table.columns.filter((c) => c.unique && !c.pk).map((c) => ({ name: `uq_${table.name}_${c.name}`, columnIds: [c.id] })),
    ...table.uniques.map((u) => ({ name: u.name, columnIds: u.columnIds })),
  ];
  const checks: Constraint[] = [
    ...table.columns
      .filter((c) => isEnum(c.type) && c.enumValues?.length)
      .map((c) => ({ name: `ck_${table.name}_${c.name}`, columnIds: [c.id], check: `${c.name} IN (${c.enumValues!.map(quoteLiteral).join(', ')})` })),
    ...(table.checks ?? []).map((c) => ({ name: c.name, columnIds: [], check: c.expression, raw: true })),
  ];
  return { uniques, checks };
};

const columnChanged = (dialect: DialectId, a: Column, b: Column) =>
  ddlType(dialect, a) !== ddlType(dialect, b) ||
  a.nullable !== b.nullable ||
  (a.defaultValue ?? '').trim() !== (b.defaultValue ?? '').trim() ||
  (a.check ?? '').trim() !== (b.check ?? '').trim() ||
  a.autoIncrement !== b.autoIncrement;

const fkSignature = (fk: ForeignKey) =>
  // Table names stay out: renaming a table keeps its FKs working.
  [fk.name, fk.columnIds.join(','), fk.refTableId, fk.refColumnIds.join(','), fk.onDelete, fk.onUpdate].join('|');

const indexSignature = (index: TableIndex, table: Table) =>
  [index.name, index.unique, index.method ?? '', (index.where ?? '').trim(), ...index.columns.map((c) => `${table.columns.find((x) => x.id === c.columnId)?.name}:${c.order}`)].join('|');

/** Statements that copy rows between tables, and the tables they read from. */
export type DataMoves = { sql: string[]; sourceTableIds: string[] };

/**
 * `dataMoves` copy rows between tables (a specialization that changes how it maps to tables). With
 * them, tables and columns are dropped only after the copy; in SQLite, a rebuilt table the rows are
 * read from is rebuilt after the copy, the others before, and CHECKs wait until the end.
 */
export const diffSchemas = (
  from: Schema,
  to: Schema,
  dialect: DialectId,
  labels: { from: string; to: string } = { from: '', to: '' },
  dataMoves: DataMoves = { sql: [], sourceTableIds: [] },
): Migration => {
  const d = DIALECTS[dialect];
  const q = (name: string) => quoteIdent(dialect, name);
  const warnings: string[] = [];
  const changes: Change[] = [];
  const oldTables = new Map(from.tables.map((x) => [x.id, x]));
  const newTables = new Map(to.tables.map((x) => [x.id, x]));
  const kept = to.tables.filter((x) => oldTables.has(x.id));
  const added = sortTables(to.tables.filter((x) => !oldTables.has(x.id)));
  const removed = from.tables.filter((x) => !newTables.has(x.id));

  // SQLite can barely ALTER: a table whose columns, key or FKs change is rebuilt and its data copied.
  const rebuild = new Set<string>();

  const dropConstraint = (table: string, name: string, kind: 'fk' | 'unique' | 'check') => {
    if (dialect === 'mysql') {
      const verb = kind === 'fk' ? 'FOREIGN KEY' : kind === 'unique' ? 'INDEX' : 'CHECK';
      return `ALTER TABLE ${q(table)} DROP ${verb} ${q(name)};`;
    }
    return `ALTER TABLE ${q(table)} DROP CONSTRAINT ${q(name)};`;
  };
  const dropIndex = (table: string, name: string) =>
    dialect === 'mysql' || dialect === 'sqlserver' ? `DROP INDEX ${q(name)} ON ${q(table)};` : `DROP INDEX ${q(name)};`;
  const renameTable = (a: string, b: string) => (dialect === 'sqlserver' ? `EXEC sp_rename ${quoteLiteral(a)}, ${quoteLiteral(b)};` : `ALTER TABLE ${q(a)} RENAME TO ${q(b)};`);
  const renameColumn = (table: string, a: string, b: string) =>
    dialect === 'sqlserver' ? `EXEC sp_rename ${quoteLiteral(`${table}.${a}`)}, ${quoteLiteral(b)}, 'COLUMN';` : `ALTER TABLE ${q(table)} RENAME COLUMN ${q(a)} TO ${q(b)};`;
  const definition = (table: Table, column: Column) => columnDefinition(column, { dialect, table, inlinePk: false, warnings });
  const addColumn = (table: Table, column: Column) => {
    const def = definition(table, column);
    if (dialect === 'oracle') return `ALTER TABLE ${q(table.name)} ADD (${def});`;
    if (dialect === 'sqlserver') return `ALTER TABLE ${q(table.name)} ADD ${def};`;
    return `ALTER TABLE ${q(table.name)} ADD COLUMN ${def};`;
  };

  /** Statements that change one column in place, per gestor. */
  const alterColumn = (table: Table, a: Column, b: Column): string[] => {
    const tn = q(table.name);
    const cn = q(b.name);
    const typeChanged = ddlType(dialect, a) !== ddlType(dialect, b);
    const defaultChanged = (a.defaultValue ?? '').trim() !== (b.defaultValue ?? '').trim();
    const out: string[] = [];
    if (a.autoIncrement !== b.autoIncrement) warnings.push(t('migration.autoIncrementManual', { column: `${table.name}.${b.name}` }));
    if ((a.check ?? '').trim() !== (b.check ?? '').trim()) warnings.push(t('migration.checkManual', { column: `${table.name}.${b.name}` }));
    switch (dialect) {
      case 'postgresql':
        if (typeChanged) out.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} TYPE ${ddlType(dialect, b)} USING ${cn}::${ddlType(dialect, b)};`);
        if (a.nullable !== b.nullable) out.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} ${b.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`);
        if (defaultChanged) out.push(b.defaultValue?.trim() ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET DEFAULT ${b.defaultValue.trim()};` : `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT;`);
        break;
      case 'mysql':
        out.push(`ALTER TABLE ${tn} MODIFY COLUMN ${definition(table, b)};`);
        break;
      case 'sqlserver':
        if (typeChanged || a.nullable !== b.nullable) out.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} ${ddlType(dialect, b)} ${b.nullable ? 'NULL' : 'NOT NULL'};`);
        if (defaultChanged) {
          if (a.defaultValue?.trim()) warnings.push(t('migration.sqlServerDefault', { column: `${table.name}.${b.name}` }));
          if (b.defaultValue?.trim()) out.push(`ALTER TABLE ${tn} ADD DEFAULT ${b.defaultValue.trim()} FOR ${cn};`);
        }
        break;
      case 'oracle': {
        const parts = [cn];
        if (typeChanged) parts.push(ddlType(dialect, b));
        if (defaultChanged) parts.push(`DEFAULT ${b.defaultValue?.trim() || 'NULL'}`);
        if (a.nullable !== b.nullable) parts.push(b.nullable ? 'NULL' : 'NOT NULL');
        if (parts.length > 1) out.push(`ALTER TABLE ${tn} MODIFY (${parts.join(' ')});`);
        break;
      }
    }
    return out;
  };

  // Work out every change first, then write them in an order the database accepts.
  const stmt = {
    dropFk: [] as string[],
    dropIndex: [] as string[],
    dropConstraint: [] as string[],
    dropTable: [] as string[],
    dropColumn: [] as string[],
    renameTable: [] as string[],
    createTable: [] as string[],
    columns: [] as string[],
    pk: [] as string[],
    addConstraint: [] as string[],
    addFk: [] as string[],
    addIndex: [] as string[],
  };

  for (const table of removed) {
    changes.push({ kind: 'dropTable', table: table.name, destructive: true });
    stmt.dropTable.push(`${t('migration.destructive')}\nDROP TABLE ${q(table.name)};`);
  }
  for (const table of added) {
    changes.push({ kind: 'createTable', table: table.name });
    stmt.createTable.push(createTable(table, dialect, newTables, warnings));
    // SQLite writes the FKs inside CREATE TABLE; the others add them once every table exists.
    if (dialect === 'sqlite') continue;
    for (const fk of table.foreignKeys) {
      changes.push({ kind: 'addFk', table: table.name, detail: fk.name });
      stmt.addFk.push(`ALTER TABLE ${q(table.name)}\n  ADD ${fkClause(dialect, fk, newTables, warnings)};`);
    }
  }

  for (const table of kept) {
    const old = oldTables.get(table.id)!;
    if (old.name !== table.name) {
      changes.push({ kind: 'renameTable', table: table.name, detail: `${old.name} → ${table.name}` });
      stmt.renameTable.push(renameTable(old.name, table.name));
    }
    const oldColumns = new Map(old.columns.map((c) => [c.id, c]));
    const newColumns = new Map(table.columns.map((c) => [c.id, c]));
    const tableChanges: { kind: ChangeKind; detail: string; destructive?: boolean; sql: string[] }[] = [];

    for (const column of table.columns) {
      const before = oldColumns.get(column.id);
      if (!before) {
        if (!column.nullable && !column.defaultValue?.trim() && !column.autoIncrement) warnings.push(t('migration.notNullNoDefault', { column: `${table.name}.${column.name}` }));
        tableChanges.push({ kind: 'addColumn', detail: column.name, sql: [addColumn(table, column)] });
        continue;
      }
      if (before.name !== column.name) tableChanges.push({ kind: 'renameColumn', detail: `${before.name} → ${column.name}`, sql: [renameColumn(table.name, before.name, column.name)] });
      if (columnChanged(dialect, before, column)) {
        tableChanges.push({ kind: 'alterColumn', detail: `${column.name}: ${ddlType(dialect, before)}${before.nullable ? '' : ' NOT NULL'} → ${ddlType(dialect, column)}${column.nullable ? '' : ' NOT NULL'}`, sql: alterColumn(table, before, column) });
      }
    }
    for (const column of old.columns) {
      if (newColumns.has(column.id)) continue;
      tableChanges.push({ kind: 'dropColumn', detail: column.name, destructive: true, sql: [`${t('migration.destructive')}\nALTER TABLE ${q(table.name)} DROP COLUMN ${q(column.name)};`] });
    }

    const pkBefore = old.pk?.columnIds ?? [];
    const pkAfter = table.pk?.columnIds ?? [];
    const pkChanged = !sameList(pkBefore, pkAfter) || (old.pk?.name ?? '') !== (table.pk?.name ?? '');
    if (pkChanged) {
      const sql: string[] = [];
      if (old.pk) sql.push(dialect === 'mysql' ? `ALTER TABLE ${q(table.name)} DROP PRIMARY KEY;` : `ALTER TABLE ${q(table.name)} DROP CONSTRAINT ${q(old.pk.name)};`);
      if (table.pk) {
        const cols = table.pk.columnIds.map((id) => q(newColumns.get(id)?.name ?? id)).join(', ');
        sql.push(`ALTER TABLE ${q(table.name)} ADD CONSTRAINT ${q(table.pk.name)} PRIMARY KEY (${cols});`);
      }
      tableChanges.push({ kind: 'changePk', detail: (table.pk?.columnIds ?? []).map((id) => newColumns.get(id)?.name).join(', '), sql });
    }

    // FKs held by this table: dropped, added or changed (a change is a drop plus an add).
    const oldFks = new Map(old.foreignKeys.map((fk) => [fk.id, fk]));
    const newFks = new Map(table.foreignKeys.map((fk) => [fk.id, fk]));
    for (const fk of old.foreignKeys) {
      const after = newFks.get(fk.id);
      if (after && fkSignature(after) === fkSignature(fk)) continue;
      changes.push({ kind: 'dropFk', table: table.name, detail: fk.name });
      if (dialect === 'sqlite') rebuild.add(table.id);
      else stmt.dropFk.push(dropConstraint(old.name, fk.name, 'fk'));
    }
    for (const fk of table.foreignKeys) {
      const before = oldFks.get(fk.id);
      if (before && fkSignature(fk) === fkSignature(before)) continue;
      changes.push({ kind: 'addFk', table: table.name, detail: fk.name });
      if (dialect === 'sqlite') rebuild.add(table.id);
      else stmt.addFk.push(`ALTER TABLE ${q(table.name)}\n  ADD ${fkClause(dialect, fk, newTables, warnings)};`);
    }

    // UNIQUE and ENUM CHECK constraints, matched by name.
    const before = constraintsOf(old);
    const after = constraintsOf(table);
    for (const kind of ['uniques', 'checks'] as const) {
      const oldByName = new Map(before[kind].map((c) => [c.name, c]));
      const newByName = new Map(after[kind].map((c) => [c.name, c]));
      for (const c of before[kind]) {
        const next = newByName.get(c.name);
        if (next && sameList(next.columnIds, c.columnIds) && next.check === c.check) continue;
        changes.push({ kind: 'dropUnique', table: table.name, detail: c.name });
        if (dialect === 'sqlite') rebuild.add(table.id);
        else stmt.dropConstraint.push(dropConstraint(old.name, c.name, kind === 'uniques' ? 'unique' : 'check'));
      }
      for (const c of after[kind]) {
        const prev = oldByName.get(c.name);
        if (prev && sameList(prev.columnIds, c.columnIds) && prev.check === c.check) continue;
        changes.push({ kind: 'addUnique', table: table.name, detail: c.name });
        if (dialect === 'sqlite') {
          rebuild.add(table.id);
          continue;
        }
        const body = c.raw ? `CHECK (${c.check})` : c.check ? `CHECK (${c.check.replace(/^\S+/, (n) => q(n))})` : `UNIQUE (${c.columnIds.map((id) => q(newColumns.get(id)?.name ?? id)).join(', ')})`;
        stmt.addConstraint.push(`ALTER TABLE ${q(table.name)} ADD CONSTRAINT ${q(c.name)} ${body};`);
      }
    }

    // SQLite adds, renames and drops columns in place, but cannot alter one or change the key.
    if (dialect === 'sqlite' && (pkChanged || tableChanges.some((c) => c.kind === 'alterColumn'))) rebuild.add(table.id);
    if (dialect === 'sqlite' && rebuild.has(table.id)) {
      // The rebuild below already carries every column change of this table.
      for (const change of tableChanges) changes.push({ kind: change.kind, table: table.name, detail: change.detail, destructive: change.destructive });
      continue;
    }
    for (const change of tableChanges) {
      changes.push({ kind: change.kind, table: table.name, detail: change.detail, destructive: change.destructive });
      const target = change.kind === 'changePk' ? stmt.pk : change.kind === 'dropColumn' ? stmt.dropColumn : stmt.columns;
      target.push(...change.sql);
    }
  }

  // Indexes, matched by id. A rebuilt SQLite table gets all its indexes back after the copy.
  for (const table of to.tables) {
    const old = oldTables.get(table.id);
    const oldIndexes = new Map((old?.indexes ?? []).map((i) => [i.id, i]));
    const newIndexes = new Map(table.indexes.map((i) => [i.id, i]));
    for (const index of old?.indexes ?? []) {
      const next = newIndexes.get(index.id);
      if (next && indexSignature(next, table) === indexSignature(index, old!) && !rebuild.has(table.id)) continue;
      if (rebuild.has(table.id)) continue;
      changes.push({ kind: 'dropIndex', table: table.name, detail: index.name });
      stmt.dropIndex.push(dropIndex(old!.name, index.name));
    }
    for (const index of table.indexes) {
      const prev = oldIndexes.get(index.id);
      if (old && prev && indexSignature(index, table) === indexSignature(prev, old) && !rebuild.has(table.id)) continue;
      if (!old) {
        changes.push({ kind: 'addIndex', table: table.name, detail: index.name });
      } else if (!prev || indexSignature(index, table) !== indexSignature(prev, old)) {
        changes.push({ kind: 'addIndex', table: table.name, detail: index.name });
      }
      const sql = createIndex(table, index, dialect, warnings);
      if (sql) stmt.addIndex.push(sql);
    }
  }
  // FKs of removed tables pointing elsewhere go away with the table; FKs from kept tables to removed ones were dropped above.
  const rebuilt: string[] = [];
  const rebuiltSources: string[] = [];
  for (const id of rebuild) {
    const table = newTables.get(id)!;
    const old = oldTables.get(id)!;
    const temp = `${table.name}__new`;
    const copy = table.columns.filter((c) => old.columns.some((o) => o.id === c.id));
    changes.push({ kind: 'rebuildTable', table: table.name });
    const create = createTable({ ...table, name: temp }, dialect, newTables, warnings);
    (dataMoves.sourceTableIds.includes(id) ? rebuiltSources : rebuilt).push(
      [
        t('migration.sqliteRebuild', { table: table.name }),
        create,
        // The table already has its new name here: renames run before the rebuild.
        `INSERT INTO ${q(temp)} (${copy.map((c) => q(c.name)).join(', ')})\n  SELECT ${copy.map((c) => q(old.columns.find((o) => o.id === c.id)!.name)).join(', ')} FROM ${q(table.name)};`,
        `DROP TABLE ${q(table.name)};`,
        `ALTER TABLE ${q(temp)} RENAME TO ${q(table.name)};`,
      ].join('\n'),
    );
  }

  // Without data to move, drops come first; with it, new tables and columns come first so the rows
  // can be copied, and only then are the old ones dropped.
  const blocks = (
    dataMoves.sql.length
      ? [stmt.dropFk, stmt.dropIndex, stmt.dropConstraint, stmt.renameTable, stmt.createTable, stmt.columns, rebuilt, dataMoves.sql, rebuiltSources, stmt.dropColumn, stmt.dropTable, stmt.pk, stmt.addConstraint, stmt.addFk, stmt.addIndex]
      : [stmt.dropFk, stmt.dropIndex, stmt.dropConstraint, stmt.dropTable, stmt.renameTable, stmt.createTable, stmt.dropColumn, stmt.columns, rebuilt, stmt.pk, stmt.addConstraint, stmt.addFk, stmt.addIndex]
  ).filter((b) => b.length);
  if (rebuilt.length || rebuiltSources.length) {
    blocks.unshift(['PRAGMA foreign_keys = OFF;']);
    blocks.push(['PRAGMA foreign_keys = ON;']);
  }
  // While rows move, a rebuilt SQLite table already has the CHECKs the copied rows will satisfy only at the end.
  if (dialect === 'sqlite' && dataMoves.sql.length) {
    blocks.unshift(['PRAGMA ignore_check_constraints = ON;']);
    blocks.push(['PRAGMA ignore_check_constraints = OFF;']);
  }
  const header = t('migration.header', { from: labels.from, to: labels.to, dialect: d.name });
  const body = blocks.length ? blocks.map((b) => b.join('\n')).join('\n\n') : t('migration.noChanges');
  return { sql: `${header}\n\n${body}\n`, changes, warnings: [...new Set(warnings)] };
};
