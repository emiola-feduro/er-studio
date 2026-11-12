import { convertType, DIALECTS } from './dialects';
import type {
  Attribute,
  Cardinality,
  DialectId,
  Entity,
  Participant,
  Position,
  Project,
  Relationship,
} from './types';

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const createProject = (name: string, dialect: DialectId): Project => {
  const now = Date.now();
  return { id: uid(), name, dialect, entities: [], relationships: [], createdAt: now, updatedAt: now };
};

export const createAttribute = (dialect: DialectId, overrides: Partial<Attribute> = {}): Attribute => {
  const { defaultText } = DIALECTS[dialect];
  return {
    id: uid(),
    name: 'nuevo_campo',
    type: defaultText.type,
    length: defaultText.length,
    pk: false,
    nullable: true,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
};

export const createPkAttribute = (dialect: DialectId, name = 'id'): Attribute =>
  createAttribute(dialect, {
    name,
    type: DIALECTS[dialect].defaultPk.type,
    length: undefined,
    pk: true,
    nullable: false,
    autoIncrement: true,
  });

export const createEntity = (dialect: DialectId, name: string, position: Position): Entity => ({
  id: uid(),
  name,
  kind: 'entity',
  nameIsCustom: true,
  attributes: [createPkAttribute(dialect)],
  indexes: [],
  position,
});

export const createParticipant = (
  entityId: string,
  cardinality: Cardinality,
  overrides: Partial<Participant> = {},
): Participant => ({ id: uid(), entityId, cardinality, optional: false, ...overrides });

export type RelationshipPreset = '1:1' | '1:N' | 'N:M';

export const createRelationship = (
  entityIds: string[],
  preset: RelationshipPreset = '1:N',
): Relationship => {
  const cards: Cardinality[] =
    entityIds.length > 2
      ? entityIds.map(() => 'N')
      : preset === '1:1'
        ? ['1', '1']
        : preset === '1:N'
          ? ['1', 'N']
          : ['N', 'N'];
  const recursive = entityIds.length === 2 && entityIds[0] === entityIds[1];
  const participants = entityIds.map((entityId, index) =>
    createParticipant(entityId, cards[index], {
      role: recursive ? (index === 0 ? 'padre' : 'hijo') : undefined,
      optional: recursive && index === 0,
    }),
  );
  return {
    id: uid(),
    participants,
    identifying: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  };
};

export const needsJunction = (rel: Relationship) =>
  rel.participants.length >= 3 ||
  (rel.participants.length === 2 && rel.participants.every((p) => p.cardinality === 'N'));

export const isRecursive = (rel: Relationship) => {
  const ids = rel.participants.map((p) => p.entityId);
  return new Set(ids).size < ids.length;
};

export type RelationshipKind = 'binaria' | 'recursiva' | 'ternaria' | 'n-aria';

export const relationshipKind = (rel: Relationship): RelationshipKind => {
  if (rel.participants.length === 3) return 'ternaria';
  if (rel.participants.length > 3) return 'n-aria';
  return isRecursive(rel) ? 'recursiva' : 'binaria';
};

export const cardinalityLabel = (rel: Relationship) =>
  rel.participants.map((p) => p.cardinality).join(':');

/** Prefix used for FK column names and junction names: the role when present, else the entity name. */
export const participantLabel = (p: Participant, entities: Entity[]) =>
  p.role?.trim() || entities.find((e) => e.id === p.entityId)?.name || 'entidad';

export const defaultJunctionName = (rel: Relationship, entities: Entity[]) => {
  const recursive = isRecursive(rel);
  return rel.participants
    .map((p) => (recursive ? participantLabel(p, entities) : entities.find((e) => e.id === p.entityId)?.name ?? 'x'))
    .join('_');
};

type Footprint = { dx: number; dy: number; width: number; height: number };

/** Moves a position step by step until no other table sits within the given footprint. */
export const freePosition = (
  start: Position,
  taken: Position[],
  { dx, dy, width, height }: Footprint = { dx: 48, dy: 48, width: 80, height: 60 },
): Position => {
  let { x, y } = start;
  for (let i = 0; i < 60 && taken.some((p) => Math.abs(p.x - x) < width && Math.abs(p.y - y) < height); i += 1) {
    x += dx;
    y += dy;
  }
  return { x: Math.round(x), y: Math.round(y) };
};

const midpoint = (positions: Position[]): Position => {
  if (positions.length === 0) return { x: 0, y: 0 };
  const sum = positions.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / positions.length, y: sum.y / positions.length + 160 };
};

/**
 * Keeps junction tables in sync with relationships: creates them when a relationship
 * needs one, removes them when it no longer does, and refreshes default names.
 * Mutates the project in place.
 */
export const syncJunctions = (project: Project) => {
  const { entities, relationships } = project;

  // Drop participants pointing to entities that no longer exist, then relationships with fewer than 2.
  const regularIds = new Set(entities.filter((e) => e.kind === 'entity').map((e) => e.id));
  for (const rel of relationships) {
    rel.participants = rel.participants.filter((p) => regularIds.has(p.entityId));
  }
  project.relationships = relationships.filter((rel) => rel.participants.length >= 2);

  const liveJunctionIds = new Set<string>();
  for (const rel of project.relationships) {
    if (!needsJunction(rel)) {
      rel.junctionId = undefined;
      continue;
    }
    let junction = rel.junctionId ? entities.find((e) => e.id === rel.junctionId) : undefined;
    if (!junction) {
      const positions = rel.participants
        .map((p) => entities.find((e) => e.id === p.entityId)?.position)
        .filter((p): p is Position => Boolean(p));
      junction = {
        id: uid(),
        name: defaultJunctionName(rel, entities),
        kind: 'junction',
        nameIsCustom: false,
        attributes: [],
        indexes: [],
        position: freePosition(midpoint(positions), entities.map((e) => e.position), {
          dx: 0,
          dy: 80,
          width: 300,
          height: 180,
        }),
        junction: { relationshipId: rel.id, pkMode: 'composite', keepUniqueOnFks: true },
      };
      entities.push(junction);
      rel.junctionId = junction.id;
    }
    if (!junction.nameIsCustom) junction.name = defaultJunctionName(rel, entities);
    liveJunctionIds.add(junction.id);
  }

  project.entities = entities.filter((e) => e.kind === 'entity' || liveJunctionIds.has(e.id));

  if (project.records) {
    const ids = new Set(project.entities.map((e) => e.id));
    for (const tableId of Object.keys(project.records)) if (!ids.has(tableId)) delete project.records[tableId];
  }
};

export type DialectChangeReport = { converted: number; kept: string[] };

/** Converts every attribute type to the target dialect. Mutates the project. */
export const changeDialect = (project: Project, to: DialectId): DialectChangeReport => {
  const from = project.dialect;
  const report: DialectChangeReport = { converted: 0, kept: [] };
  for (const entity of project.entities) {
    for (const attr of entity.attributes) {
      const converted = convertType(from, to, attr);
      if (!converted) {
        report.kept.push(`${entity.name}.${attr.name} (${attr.type})`);
        continue;
      }
      attr.type = converted.type;
      attr.length = converted.length;
      attr.precision = converted.precision;
      attr.scale = converted.scale;
      report.converted += 1;
    }
    for (const index of entity.indexes) {
      if (index.method && !DIALECTS[to].indexMethods.includes(index.method)) index.method = undefined;
    }
  }
  for (const rel of project.relationships) {
    const actions = DIALECTS[to].referentialActions;
    if (!actions.includes(rel.onDelete)) rel.onDelete = 'NO ACTION';
    if (!actions.includes(rel.onUpdate)) rel.onUpdate = 'NO ACTION';
  }
  project.dialect = to;
  return report;
};

/** Next free "Entidad N" style name. */
export const nextName = (base: string, taken: string[]) => {
  const set = new Set(taken.map((n) => n.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  let i = 2;
  while (set.has(`${base}_${i}`.toLowerCase())) i += 1;
  return `${base}_${i}`;
};
