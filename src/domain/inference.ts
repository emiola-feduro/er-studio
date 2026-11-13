import { t } from '../i18n';
import { fkTypeFor } from './dialects';
import { isRecursive, needsJunction, participantLabel } from './model';
import type {
  Column,
  EndMarker,
  Entity,
  ForeignKey,
  Issue,
  Participant,
  Project,
  Relationship,
  Schema,
  Table,
  TableIndex,
} from './types';

type Placement = {
  id: string;
  rel: Relationship;
  participant: Participant;
  holderId: string;
  refId: string;
  prefix: string;
  identifying: boolean;
  nullable: boolean;
  unique: boolean;
  holderEnd: EndMarker;
  refEnd: EndMarker;
  /** For junctions: whether this FK is part of the default key (ternary dependency rule). */
  inDefaultKey: boolean;
};

const endMarker = (cardinality: '1' | 'N', optional: boolean): EndMarker => {
  if (cardinality === 'N') return optional ? 'zeroOrMany' : 'many';
  return optional ? 'zeroOrOne' : 'one';
};

/**
 * Participants whose FKs form the default key of a junction table.
 * All N participants, plus enough 1 participants to reach n-1 columns groups
 * (a participant with cardinality 1 is functionally determined by the others).
 */
export const defaultKeyParticipants = (rel: Relationship): Participant[] => {
  const many = rel.participants.filter((p) => p.cardinality === 'N');
  const ones = rel.participants.filter((p) => p.cardinality === '1');
  if (ones.length === 0) return rel.participants;
  const needed = Math.max(0, rel.participants.length - 1 - many.length);
  return [...many, ...ones.slice(0, needed)];
};

export const fkColumnId = (relId: string, participantId: string, refColumnId: string) =>
  `fk:${relId}:${participantId}:${refColumnId}`;

const fkColumnName = (prefix: string, refColumnName: string) =>
  refColumnName.toLowerCase().startsWith(`${prefix.toLowerCase()}_`) ? refColumnName : `${prefix}_${refColumnName}`;

const buildPlacements = (project: Project, issues: Issue[]): Placement[] => {
  const { entities, relationships } = project;
  const placements: Placement[] = [];

  for (const rel of relationships) {
    const { participants } = rel;
    if (participants.length < 2) continue;

    if (needsJunction(rel)) {
      const junction = entities.find((e) => e.id === rel.junctionId);
      if (!junction) continue;
      const keyIds = new Set(defaultKeyParticipants(rel).map((p) => p.id));
      const composite = junction.junction?.pkMode !== 'surrogate';
      for (const p of participants) {
        placements.push({
          id: `${rel.id}:${p.id}`,
          rel,
          participant: p,
          holderId: junction.id,
          refId: p.entityId,
          prefix: participantLabel(p, entities),
          identifying: composite && keyIds.has(p.id),
          inDefaultKey: keyIds.has(p.id),
          nullable: false,
          unique: false,
          holderEnd: endMarker('N', p.optional),
          refEnd: 'one',
        });
      }
      continue;
    }

    const [a, b] = participants;
    // A(1) to B(N): B holds the FK. For 1:1 the second participant holds it.
    const [parent, child] = a.cardinality === 'N' && b.cardinality === '1' ? [b, a] : [a, b];
    const recursive = isRecursive(rel);
    if (recursive && rel.identifying) {
      issues.push({
        level: 'warning',
        message: t('issue.recursiveIdentifying'),
        relationshipId: rel.id,
      });
    }
    placements.push({
      id: `${rel.id}:${parent.id}`,
      rel,
      participant: parent,
      holderId: child.entityId,
      refId: parent.entityId,
      prefix: participantLabel(parent, entities),
      identifying: rel.identifying && !recursive,
      inDefaultKey: false,
      nullable: parent.optional && !(rel.identifying && !recursive),
      unique: child.cardinality === '1',
      holderEnd: endMarker(child.cardinality, child.optional),
      refEnd: endMarker(parent.cardinality, parent.optional),
    });
  }
  return placements;
};

const attributeColumn = (attr: Entity['attributes'][number]): Column => ({
  id: attr.id,
  name: attr.name,
  type: attr.type,
  length: attr.length,
  precision: attr.precision,
  scale: attr.scale,
  nullable: attr.pk ? false : attr.nullable,
  unique: attr.unique,
  autoIncrement: attr.autoIncrement,
  defaultValue: attr.defaultValue,
  check: attr.check,
  enumValues: attr.enumValues,
  pk: false,
  origin: 'attribute',
});

const dedupe = (name: string, used: Set<string>) => {
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${name}_${i}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

export const defaultIndexName = (tableName: string, columnNames: string[]) =>
  `idx_${tableName}_${columnNames.join('_') || 'sin_columnas'}`;

/** Derives the physical schema (tables, columns, PKs, FKs, uniques, indexes) from the model. */
export const buildSchema = (project: Project): Schema => {
  const issues: Issue[] = [];
  const { entities, dialect } = project;
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const placements = buildPlacements(project, issues);
  const placementsByHolder = new Map<string, Placement[]>();
  for (const pl of placements) {
    const list = placementsByHolder.get(pl.holderId) ?? [];
    list.push(pl);
    placementsByHolder.set(pl.holderId, list);
  }

  const attrColumns = new Map<string, Column[]>();
  for (const entity of entities) attrColumns.set(entity.id, entity.attributes.map(attributeColumn));

  const fkColumns = new Map<string, Column[]>(); // placement id -> columns
  const pkCache = new Map<string, Column[]>(); // table id -> pk columns
  const resolving = new Set<string>();
  const usedFkNames = new Set<string>();
  const foreignKeys: ForeignKey[] = [];

  const ownPk = (entityId: string) => {
    const entity = entityById.get(entityId);
    const columns = attrColumns.get(entityId) ?? [];
    if (!entity) return [];
    return entity.attributes
      .filter((a) => a.pk)
      .map((a) => columns.find((c) => c.id === a.id))
      .filter((c): c is Column => Boolean(c));
  };

  const pkColumns = (entityId: string): Column[] => {
    const cached = pkCache.get(entityId);
    if (cached) return cached;
    const entity = entityById.get(entityId);
    if (!entity) return [];
    if (resolving.has(entityId)) {
      issues.push({
        level: 'error',
        message: t('issue.identifyingCycle', { name: entity.name }),
        entityId,
      });
      return ownPk(entityId);
    }
    resolving.add(entityId);
    const identifying = (placementsByHolder.get(entityId) ?? []).filter((pl) => pl.identifying);
    const fromFks = identifying.flatMap((pl) => ensureFk(pl));
    const own = ownPk(entityId);
    const isJunction = entity.kind === 'junction';
    const surrogate = entity.junction?.pkMode === 'surrogate';
    const result = isJunction && surrogate ? own : [...fromFks, ...own];
    resolving.delete(entityId);
    pkCache.set(entityId, result);
    return result;
  };

  /** The referenced entity's PK, or the UNIQUE attribute the participant points to. */
  const referencedColumns = (pl: Placement, refEntity: Entity, holder: Entity): Column[] => {
    const attrId = pl.participant.refAttributeId;
    const attr = attrId ? refEntity.attributes.find((a) => a.id === attrId) : undefined;
    if (!attr) return pkColumns(pl.refId);
    const ownKey = refEntity.attributes.filter((a) => a.pk);
    if (!attr.unique && !(attr.pk && ownKey.length === 1)) {
      issues.push({
        level: 'error',
        message: t('issue.fkNotUnique', { holder: holder.name, target: `${refEntity.name}.${attr.name}` }),
        entityId: holder.id,
        relationshipId: pl.rel.id,
      });
    }
    const column = attrColumns.get(refEntity.id)?.find((c) => c.id === attr.id);
    return column ? [column] : pkColumns(pl.refId);
  };

  const ensureFk = (pl: Placement): Column[] => {
    const existing = fkColumns.get(pl.id);
    if (existing) return existing;
    const refEntity = entityById.get(pl.refId);
    const holder = entityById.get(pl.holderId);
    if (!refEntity || !holder) return [];
    const refPk = referencedColumns(pl, refEntity, holder);
    if (refPk.length === 0) {
      issues.push({
        level: 'error',
        message: t('issue.noPkForFk', { ref: refEntity.name, holder: holder.name }),
        entityId: refEntity.id,
        relationshipId: pl.rel.id,
      });
      fkColumns.set(pl.id, []);
      return [];
    }
    const columns: Column[] = refPk.map((ref) => ({
      id: fkColumnId(pl.rel.id, pl.participant.id, ref.id),
      name: fkColumnName(pl.prefix, ref.name),
      ...fkTypeFor(dialect, ref),
      nullable: pl.nullable,
      unique: false,
      autoIncrement: false,
      pk: false,
      origin: 'fk',
    }));
    fkColumns.set(pl.id, columns);
    const name = dedupe(
      pl.participant.constraintName?.trim() || `fk_${holder.name}_${pl.prefix}`,
      usedFkNames,
    );
    const fk: ForeignKey = {
      id: pl.id,
      name,
      tableId: holder.id,
      columnIds: columns.map((c) => c.id),
      refTableId: refEntity.id,
      refColumnIds: refPk.map((c) => c.id),
      onDelete: pl.rel.onDelete,
      onUpdate: pl.rel.onUpdate,
      relationshipId: pl.rel.id,
      participantId: pl.participant.id,
      holderEnd: pl.holderEnd,
      refEnd: pl.refEnd,
    };
    for (const c of columns) c.fkId = fk.id;
    foreignKeys.push(fk);
    return columns;
  };

  for (const entity of entities) pkColumns(entity.id);
  for (const pl of placements) ensureFk(pl);

  const tables: Table[] = entities.map((entity) => {
    const own = attrColumns.get(entity.id) ?? [];
    const holderPlacements = placementsByHolder.get(entity.id) ?? [];
    const pk = pkCache.get(entity.id) ?? [];
    const pkIds = new Set(pk.map((c) => c.id));
    const fkCols = holderPlacements.flatMap((pl) => fkColumns.get(pl.id) ?? []);
    const identifyingFk = fkCols.filter((c) => pkIds.has(c.id));
    const otherFk = fkCols.filter((c) => !pkIds.has(c.id));

    let ordered: Column[];
    if (entity.kind === 'junction') {
      const ownPkCols = own.filter((c) => entity.attributes.find((a) => a.id === c.id)?.pk);
      const ownRest = own.filter((c) => !ownPkCols.includes(c));
      ordered = [...ownPkCols, ...identifyingFk, ...otherFk, ...ownRest];
    } else {
      ordered = [...identifyingFk, ...own, ...otherFk];
    }

    // Avoid duplicated column names inside a table.
    const usedNames = new Set<string>();
    const columns = ordered.map((c) => {
      const col = { ...c, pk: pkIds.has(c.id) };
      if (col.pk) col.nullable = false;
      if (col.origin === 'fk') col.name = dedupe(col.name, usedNames);
      else usedNames.add(col.name.toLowerCase());
      return col;
    });
    const nameOf = (id: string) => columns.find((c) => c.id === id)?.name ?? id;

    const uniques = holderPlacements
      .filter((pl) => pl.unique)
      .map((pl) => {
        const ids = (fkColumns.get(pl.id) ?? []).map((c) => c.id);
        return { name: `uq_${entity.name}_${ids.map(nameOf).join('_')}`, columnIds: ids };
      })
      .filter((u) => u.columnIds.length > 0);

    if (entity.kind === 'junction' && entity.junction?.pkMode === 'surrogate' && entity.junction.keepUniqueOnFks) {
      const ids = holderPlacements
        .filter((pl) => pl.inDefaultKey)
        .flatMap((pl) => (fkColumns.get(pl.id) ?? []).map((c) => c.id));
      if (ids.length > 0) uniques.push({ name: `uq_${entity.name}_${ids.map(nameOf).join('_')}`, columnIds: ids });
    }

    if (pk.length === 0 && !(entity.kind === 'junction' && holderPlacements.length === 0)) {
      issues.push({
        level: entity.kind === 'junction' ? 'error' : 'warning',
        message:
          entity.kind === 'junction'
            ? t('issue.junctionNoPk', { name: entity.name })
            : t('issue.noPk', { name: entity.name }),
        entityId: entity.id,
      });
    }

    const columnIds = new Set(columns.map((c) => c.id));
    const indexes: TableIndex[] = entity.indexes.map((index) => {
      const kept = index.columns.filter((ic) => columnIds.has(ic.columnId));
      if (kept.length < index.columns.length) {
        issues.push({
          level: 'warning',
          message: t('issue.indexMissingColumns', { index: index.name || t('common.unnamed'), table: entity.name }),
          entityId: entity.id,
        });
      }
      return {
        ...index,
        columns: kept,
        name: index.nameIsCustom && index.name.trim()
          ? index.name.trim()
          : defaultIndexName(entity.name, kept.map((ic) => nameOf(ic.columnId))),
      };
    });

    const table: Table = {
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      arity: entity.kind === 'junction' ? holderPlacements.length : undefined,
      columns,
      pk: pk.length > 0 ? { name: `pk_${entity.name}`, columnIds: pk.map((c) => c.id) } : undefined,
      uniques,
      foreignKeys: foreignKeys.filter((fk) => fk.tableId === entity.id),
      indexes,
    };
    return table;
  });

  return { tables, foreignKeys, issues };
};
