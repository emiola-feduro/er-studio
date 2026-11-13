import { t, type MessageKey } from '../i18n';
import { ddlType, DIALECTS, findType, isSerial } from './dialects';
import type { Column, ForeignKey, Project, ReferentialAction, Schema, Table } from './types';

/**
 * A neutral description of the data model, meant to be handed to a coding agent so it can write
 * classes, data classes or ORM models. Keys are English so any tool can read them; only the
 * instructions follow the interface language.
 */

export type SpecColumn = {
  name: string;
  sqlType: string;
  /** Portable type family (int, varchar, date, uuid, enum...) or "custom". */
  logicalType: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  default?: string;
  check?: string;
  enumValues?: string[];
  references?: { table: string; column: string };
};

export type RelationKind = 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

export type SpecRelation = {
  kind: RelationKind;
  /** Table on the other side; several for ternary and n-ary relationships. */
  targets: string[];
  name?: string;
  /** Junction table used by many-to-many relationships. */
  via?: string;
  /** FK columns of the table holding the key, and what they point to. */
  foreignKey?: { table: string; columns: string[]; references: { table: string; columns: string[] } };
  /** True when the FK accepts NULL, so the related row is not required. */
  optional: boolean;
  identifying: boolean;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
};

export type SpecIndex = { name: string; columns: { name: string; order: 'ASC' | 'DESC' }[]; unique: boolean; method?: string; where?: string };

export type SpecEntity = {
  name: string;
  kind: 'entity' | 'junction';
  primaryKey: string[];
  columns: SpecColumn[];
  uniqueConstraints: string[][];
  indexes: SpecIndex[];
  relations: SpecRelation[];
};

export type ModelSpec = { project: string; dialect: string; database?: string; entities: SpecEntity[] };

const columnNames = (table: Table, ids: string[]) => ids.map((id) => table.columns.find((c) => c.id === id)?.name ?? id);

const specColumn = (project: Project, column: Column, tables: Map<string, Table>, fks: ForeignKey[]): SpecColumn => {
  const def = findType(DIALECTS[project.dialect], column.type);
  const fk = fks.find((f) => f.id === column.fkId);
  const ref = fk && tables.get(fk.refTableId);
  const refColumn = fk && ref ? columnNames(ref, [fk.refColumnIds[fk.columnIds.indexOf(column.id)]])[0] : undefined;
  const spec: SpecColumn = {
    name: column.name,
    sqlType: ddlType(project.dialect, column),
    logicalType: def?.generic ?? 'custom',
    nullable: column.nullable && !column.pk,
    primaryKey: column.pk,
    unique: column.unique,
    autoIncrement: column.autoIncrement || isSerial(project.dialect, column.type),
  };
  if (column.length != null) spec.length = column.length;
  if (column.precision != null) spec.precision = column.precision;
  if (column.scale != null) spec.scale = column.scale;
  if (column.defaultValue?.trim()) spec.default = column.defaultValue.trim();
  if (column.check?.trim()) spec.check = column.check.trim();
  if (column.enumValues?.length) spec.enumValues = column.enumValues;
  if (ref && refColumn) spec.references = { table: ref.name, column: refColumn };
  return spec;
};

/** Relations of one table, seen from that table. Junction tables become many-to-many on both sides. */
const relationsOf = (project: Project, table: Table, schema: Schema, tables: Map<string, Table>): SpecRelation[] => {
  const relName = (fk: ForeignKey) => project.relationships.find((r) => r.id === fk.relationshipId)?.name?.trim() || undefined;
  const identifying = (fk: ForeignKey) => project.relationships.find((r) => r.id === fk.relationshipId)?.identifying ?? false;
  const fkInfo = (fk: ForeignKey) => {
    const holder = tables.get(fk.tableId)!;
    const ref = tables.get(fk.refTableId)!;
    return {
      table: holder.name,
      columns: columnNames(holder, fk.columnIds),
      references: { table: ref.name, columns: columnNames(ref, fk.refColumnIds) },
    };
  };
  const optional = (fk: ForeignKey) => fk.columnIds.every((id) => tables.get(fk.tableId)?.columns.find((c) => c.id === id)?.nullable);
  const relations: SpecRelation[] = [];

  for (const fk of schema.foreignKeys) {
    const holder = tables.get(fk.tableId);
    const ref = tables.get(fk.refTableId);
    if (!holder || !ref) continue;
    const base = { name: relName(fk), optional: optional(fk), identifying: identifying(fk), onDelete: fk.onDelete, onUpdate: fk.onUpdate };
    const oneToOne = fk.holderEnd === 'one' || fk.holderEnd === 'zeroOrOne';

    if (holder.id === table.id) {
      relations.push({ ...base, kind: oneToOne ? 'one-to-one' : 'many-to-one', targets: [ref.name], foreignKey: fkInfo(fk) });
    }
    if (ref.id === table.id) {
      if (holder.kind === 'junction') {
        // Seen from a participant, a junction is a many-to-many with the other participants.
        const others = schema.foreignKeys.filter((f) => f.tableId === holder.id && f.id !== fk.id).map((f) => tables.get(f.refTableId)?.name ?? '?');
        relations.push({ ...base, kind: 'many-to-many', targets: others, via: holder.name, foreignKey: fkInfo(fk) });
      } else {
        // A recursive FK also lands here: the table is both the holder and the referenced side.
        relations.push({ ...base, kind: oneToOne ? 'one-to-one' : 'one-to-many', targets: [holder.name], foreignKey: fkInfo(fk) });
      }
    }
  }
  return relations;
};

/** Spec of the whole model, or of the given tables only (relations still name the other tables). */
export const buildModelSpec = (project: Project, schema: Schema, tableIds?: string[]): ModelSpec => {
  const tables = new Map(schema.tables.map((table) => [table.id, table]));
  const chosen = tableIds ? schema.tables.filter((table) => tableIds.includes(table.id)) : schema.tables;
  return {
    project: project.name,
    dialect: DIALECTS[project.dialect].name,
    ...(project.databaseName?.trim() ? { database: project.databaseName.trim() } : {}),
    entities: chosen.map((table) => ({
      name: table.name,
      kind: table.kind,
      primaryKey: table.pk ? columnNames(table, table.pk.columnIds) : [],
      columns: table.columns.map((column) => specColumn(project, column, tables, schema.foreignKeys)),
      uniqueConstraints: table.uniques.map((u) => columnNames(table, u.columnIds)),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        columns: index.columns.map((c) => ({ name: columnNames(table, [c.columnId])[0], order: c.order })),
        unique: index.unique,
        ...(index.method ? { method: index.method } : {}),
        ...(index.where?.trim() ? { where: index.where.trim() } : {}),
      })),
      relations: relationsOf(project, table, schema, tables),
    })),
  };
};

/* Output for agents */

export type AgentExportOptions = {
  /** Language, framework or ORM the agent should write for. Empty lets the agent ask. */
  target?: string;
  notes?: string;
  /** DDL script appended as an exact reference. */
  ddl?: string;
};

export const agentInstructions = ({ target, notes }: AgentExportOptions) => {
  const lines = [target?.trim() ? t('agentExport.instructionsTarget', { target: target.trim() }) : t('agentExport.instructionsAny'), t('agentExport.instructionsRules')];
  if (notes?.trim()) lines.push(t('agentExport.notes', { notes: notes.trim() }));
  return lines.join('\n\n');
};

export const toAgentJson = (spec: ModelSpec, options: AgentExportOptions) =>
  `${JSON.stringify(
    {
      format: 'er-studio.model-spec',
      version: 1,
      instructions: agentInstructions(options),
      ...(options.target?.trim() ? { target: options.target.trim() } : {}),
      ...(options.notes?.trim() ? { notes: options.notes.trim() } : {}),
      ...spec,
      ...(options.ddl ? { ddl: options.ddl } : {}),
    },
    null,
    2,
  )}\n`;

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const columnConstraints = (column: SpecColumn) =>
  [
    column.autoIncrement && t('agentExport.autoIncrement'),
    column.unique && !column.primaryKey && 'UNIQUE',
    column.enumValues && t('agentExport.enumValues', { values: column.enumValues.join(', ') }),
    column.default && `DEFAULT ${column.default}`,
    column.check && `CHECK (${column.check})`,
  ]
    .filter(Boolean)
    .join('; ');

const relationLine = (relation: SpecRelation) => {
  const kind = t(`agentExport.kind.${relation.kind}` as MessageKey);
  const targets = relation.targets.join(', ');
  const parts = [relation.via ? t('agentExport.relationVia', { kind, targets, via: relation.via }) : t('agentExport.relationWith', { kind, targets })];
  if (relation.foreignKey) {
    const { table, columns, references } = relation.foreignKey;
    parts.push(`FK ${table}(${columns.join(', ')}) → ${references.table}(${references.columns.join(', ')})`);
  }
  parts.push(relation.optional ? t('agentExport.optional') : t('agentExport.required'));
  if (relation.identifying) parts.push(t('agentExport.identifying'));
  if (relation.onDelete !== 'NO ACTION') parts.push(`ON DELETE ${relation.onDelete}`);
  if (relation.onUpdate !== 'NO ACTION') parts.push(`ON UPDATE ${relation.onUpdate}`);
  return `- ${relation.name ? `**${relation.name}**: ` : ''}${parts.join(', ')}`;
};

const entityMarkdown = (entity: SpecEntity) => {
  const lines = [`## ${entity.name}`, ''];
  if (entity.kind === 'junction') lines.push(t('agentExport.junction'), '');
  lines.push(
    `| ${t('agentExport.col.column')} | ${t('agentExport.col.sqlType')} | ${t('agentExport.col.logicalType')} | ${t('agentExport.col.nullable')} | ${t('agentExport.col.key')} | ${t('agentExport.col.constraints')} |`,
    '|---|---|---|---|---|---|',
  );
  for (const column of entity.columns) {
    const key = [column.primaryKey && 'PK', column.references && `FK → ${column.references.table}.${column.references.column}`].filter(Boolean).join(', ');
    lines.push(
      `| ${cell(column.name)} | ${cell(column.sqlType)} | ${column.logicalType} | ${column.nullable ? t('agentExport.yes') : t('agentExport.no')} | ${cell(key)} | ${cell(columnConstraints(column))} |`,
    );
  }
  lines.push('');
  if (entity.primaryKey.length) lines.push(`**${t('agentExport.primaryKey')}:** ${entity.primaryKey.join(', ')}`, '');
  if (entity.uniqueConstraints.length) {
    lines.push(`**${t('agentExport.uniques')}:** ${entity.uniqueConstraints.map((u) => `(${u.join(', ')})`).join(', ')}`, '');
  }
  if (entity.indexes.length) {
    lines.push(`**${t('agentExport.indexes')}:**`, '');
    for (const index of entity.indexes) {
      const cols = index.columns.map((c) => (c.order === 'DESC' ? `${c.name} DESC` : c.name)).join(', ');
      lines.push(`- ${index.name} (${cols})${index.unique ? ' UNIQUE' : ''}${index.method ? ` USING ${index.method}` : ''}${index.where ? ` WHERE ${index.where}` : ''}`);
    }
    lines.push('');
  }
  if (entity.relations.length) {
    lines.push(`**${t('agentExport.relations')}:**`, '', ...entity.relations.map(relationLine), '');
  }
  return lines.join('\n');
};

export const toAgentMarkdown = (spec: ModelSpec, options: AgentExportOptions) => {
  const lines = [
    `# ${t('agentExport.title', { project: spec.project })}`,
    '',
    `## ${t('agentExport.instructions')}`,
    '',
    agentInstructions(options),
    '',
    `- ${t('agentExport.dialect')}: ${spec.dialect}`,
    ...(spec.database ? [`- ${t('agentExport.database')}: ${spec.database}`] : []),
    `- ${t('agentExport.entities')}: ${spec.entities.map((e) => e.name).join(', ')}`,
    '',
    ...spec.entities.map(entityMarkdown),
  ];
  if (options.ddl) lines.push(`## ${t('agentExport.ddl')}`, '', '```sql', options.ddl.trimEnd(), '```', '');
  return `${lines.join('\n').trimEnd()}\n`;
};
