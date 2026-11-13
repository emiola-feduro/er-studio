import { formatList, t as translate } from '../i18n';
import { DIALECTS } from '../domain/dialects';
import { generateRows, randomCellValue } from '../domain/random-values';
import { nextAutoValue } from '../domain/records';
import { getDerived } from './derived';
import {
  changeDialect,
  createAttribute,
  createEntity,
  createParticipant,
  createPkAttribute,
  createRelationship,
  freePosition,
  nextName,
  uid,
  type RelationshipPreset,
} from '../domain/model';
import type { Attribute, DialectId, Entity, Participant, Position, Project, Relationship, TableIndex } from '../domain/types';
import useProjectStore from '../stores/use-project-store';
import useUiStore from '../stores/use-ui-store';

/** Model editing commands. Each one is a single undoable step (or coalesced by key). */

const mutate = (change: (draft: Project) => void, key?: string) => useProjectStore.getState().mutate(change, key);

const entityIn = (draft: Project, id: string) => draft.entities.find((e) => e.id === id);
const relIn = (draft: Project, id: string) => draft.relationships.find((r) => r.id === id);

export const addEntity = (position?: Position) => {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const regular = project.entities.filter((e) => e.kind === 'entity');
  const name = nextName(translate('entity.newName'), project.entities.map((e) => e.name));
  const fallback = { x: (regular.length % 4) * 320, y: Math.floor(regular.length / 4) * 300 };
  const entity = createEntity(
    project.dialect,
    name,
    freePosition(position ?? fallback, project.entities.map((e) => e.position)),
  );
  mutate((draft) => {
    draft.entities.push(entity);
  });
  useUiStore.getState().select({ kind: 'entity', id: entity.id });
};

export const updateEntity = (id: string, patch: Partial<Entity>, key?: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, id);
    if (entity) Object.assign(entity, patch);
  }, key);

export const renameEntity = (id: string, name: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, id);
    if (!entity) return;
    entity.name = name;
    if (entity.kind === 'junction') entity.nameIsCustom = true;
  }, `entity-name:${id}`);

export const resetJunctionName = (id: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, id);
    if (entity) entity.nameIsCustom = false;
  });

export const moveEntities = (moves: { id: string; position: Position }[]) =>
  mutate((draft) => {
    for (const { id, position } of moves) {
      const entity = entityIn(draft, id);
      if (entity) entity.position = { x: Math.round(position.x), y: Math.round(position.y) };
    }
  });

export const deleteEntity = (id: string) => {
  mutate((draft) => {
    const entity = entityIn(draft, id);
    if (!entity) return;
    if (entity.kind === 'junction') {
      draft.relationships = draft.relationships.filter((r) => r.id !== entity.junction?.relationshipId);
    }
    draft.entities = draft.entities.filter((e) => e.id !== id);
  });
  const { selection, select } = useUiStore.getState();
  if (selection?.id === id) select(null);
};

export const duplicateEntity = (id: string) => {
  const project = useProjectStore.getState().project;
  const source = project?.entities.find((e) => e.id === id);
  if (!project || !source || source.kind !== 'entity') return;
  const copy: Entity = {
    ...structuredClone(source),
    id: uid(),
    name: nextName(translate('entity.copyName', { name: source.name }), project.entities.map((e) => e.name)),
    position: { x: source.position.x + 40, y: source.position.y + 40 },
    attributes: source.attributes.map((a) => ({ ...a, id: uid() })),
    indexes: [],
  };
  mutate((draft) => {
    draft.entities.push(copy);
  });
  useUiStore.getState().select({ kind: 'entity', id: copy.id });
};

export const addAttribute = (entityId: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (!entity) return;
    entity.attributes.push(
      createAttribute(draft.dialect, { name: nextName(translate('attr.newName'), entity.attributes.map((a) => a.name)) }),
    );
  });

export const updateAttribute = (entityId: string, attrId: string, patch: Partial<Attribute>, key?: string) =>
  mutate((draft) => {
    const attr = entityIn(draft, entityId)?.attributes.find((a) => a.id === attrId);
    if (!attr) return;
    Object.assign(attr, patch);
    if (attr.pk) attr.nullable = false;
  }, key ?? `attr:${attrId}:${Object.keys(patch).join(',')}`);

export const deleteAttribute = (entityId: string, attrId: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (!entity) return;
    entity.attributes = entity.attributes.filter((a) => a.id !== attrId);
    for (const index of entity.indexes) index.columns = index.columns.filter((c) => c.columnId !== attrId);
  });

export const moveAttribute = (entityId: string, attrId: string, delta: -1 | 1) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (!entity) return;
    const i = entity.attributes.findIndex((a) => a.id === attrId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= entity.attributes.length) return;
    [entity.attributes[i], entity.attributes[j]] = [entity.attributes[j], entity.attributes[i]];
  });

export const setJunctionPkMode = (entityId: string, mode: 'composite' | 'surrogate') =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (!entity?.junction) return;
    entity.junction.pkMode = mode;
    if (mode === 'surrogate' && !entity.attributes.some((a) => a.pk && a.autoIncrement)) {
      // Attributes that were extending the composite key stop being key columns; a new surrogate id takes over.
      for (const attr of entity.attributes) attr.pk = false;
      const name = entity.attributes.some((a) => a.name === 'id') ? `${entity.name}_id` : 'id';
      entity.attributes.unshift(createPkAttribute(draft.dialect, name));
    }
    if (mode === 'composite') {
      // An auto increment surrogate key makes no sense inside a composite key, so it is removed (undo restores it).
      entity.attributes = entity.attributes.filter((a) => !(a.pk && a.autoIncrement));
    }
  });

export const setJunctionKeepUnique = (entityId: string, keepUniqueOnFks: boolean) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (entity?.junction) entity.junction.keepUniqueOnFks = keepUniqueOnFks;
  });

/* Indexes */

export const addIndex = (entityId: string, columnId?: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (!entity) return;
    const index: TableIndex = {
      id: uid(),
      name: '',
      nameIsCustom: false,
      unique: false,
      columns: columnId ? [{ columnId, order: 'ASC' }] : [],
    };
    entity.indexes.push(index);
  });

export const updateIndex = (entityId: string, indexId: string, patch: Partial<TableIndex>, key?: string) =>
  mutate((draft) => {
    const index = entityIn(draft, entityId)?.indexes.find((i) => i.id === indexId);
    if (index) Object.assign(index, patch);
  }, key);

export const deleteIndex = (entityId: string, indexId: string) =>
  mutate((draft) => {
    const entity = entityIn(draft, entityId);
    if (entity) entity.indexes = entity.indexes.filter((i) => i.id !== indexId);
  });

/* Relationships */

export const addRelationship = (entityIds: string[], preset: RelationshipPreset) => {
  const rel = createRelationship(entityIds, preset);
  mutate((draft) => {
    draft.relationships.push(rel);
  });
  useUiStore.getState().select({ kind: 'relationship', id: rel.id });
  return rel;
};

export const updateRelationship = (id: string, patch: Partial<Relationship>, key?: string) =>
  mutate((draft) => {
    const rel = relIn(draft, id);
    if (rel) Object.assign(rel, patch);
  }, key);

export const updateParticipant = (relId: string, participantId: string, patch: Partial<Participant>, key?: string) =>
  mutate((draft) => {
    const p = relIn(draft, relId)?.participants.find((x) => x.id === participantId);
    if (p) Object.assign(p, patch);
  }, key);

export const addParticipant = (relId: string, entityId: string) =>
  mutate((draft) => {
    const rel = relIn(draft, relId);
    if (rel) rel.participants.push(createParticipant(entityId, 'N'));
  });

export const removeParticipant = (relId: string, participantId: string) =>
  mutate((draft) => {
    const rel = relIn(draft, relId);
    if (!rel || rel.participants.length <= 2) return;
    rel.participants = rel.participants.filter((p) => p.id !== participantId);
  });

export const swapParticipants = (relId: string) =>
  mutate((draft) => {
    const rel = relIn(draft, relId);
    if (rel && rel.participants.length === 2) rel.participants.reverse();
  });

export const deleteRelationship = (id: string) => {
  mutate((draft) => {
    draft.relationships = draft.relationships.filter((r) => r.id !== id);
  });
  const { selection, select } = useUiStore.getState();
  if (selection?.id === id) select(null);
};

/* Data rows */

export const addRow = (tableId: string) => {
  const project = useProjectStore.getState().project;
  const table = project && getDerived(project).schema.tables.find((t) => t.id === tableId);
  if (!project || !table) return;
  const rows = project.records?.[tableId] ?? [];
  const values: Record<string, string> = {};
  for (const column of table.columns) {
    // Auto increment keys are filled in so other tables can reference the row right away.
    if (column.autoIncrement && column.pk) values[column.id] = nextAutoValue(rows, column.id);
  }
  mutate((draft) => {
    draft.records ??= {};
    (draft.records[tableId] ??= []).push({ id: uid(), values });
  });
};

export const updateCell = (tableId: string, rowId: string, columnId: string, value: string) =>
  mutate((draft) => {
    const row = draft.records?.[tableId]?.find((r) => r.id === rowId);
    if (!row) return;
    if (value === '') delete row.values[columnId];
    else row.values[columnId] = value;
  }, `cell:${rowId}:${columnId}`);

export const deleteRow = (tableId: string, rowId: string) =>
  mutate((draft) => {
    const rows = draft.records?.[tableId];
    if (rows) draft.records![tableId] = rows.filter((r) => r.id !== rowId);
  });

export const duplicateRow = (tableId: string, rowId: string) => {
  const project = useProjectStore.getState().project;
  const table = project && getDerived(project).schema.tables.find((t) => t.id === tableId);
  const rows = project?.records?.[tableId] ?? [];
  const source = rows.find((r) => r.id === rowId);
  if (!table || !source) return;
  const values = { ...source.values };
  for (const column of table.columns) if (column.autoIncrement && column.pk) values[column.id] = nextAutoValue(rows, column.id);
  mutate((draft) => {
    const list = draft.records?.[tableId];
    if (!list) return;
    list.splice(list.findIndex((r) => r.id === rowId) + 1, 0, { id: uid(), values });
  });
};

/** Appends rows filled with random values that fit each column type. Returns how many were added. */
export const addRandomRows = (tableId: string, count: number) => {
  const project = useProjectStore.getState().project;
  if (!project) return 0;
  const { rows, missingRefs } = generateRows(project, getDerived(project).schema, tableId, count);
  mutate((draft) => {
    draft.records ??= {};
    const list = (draft.records[tableId] ??= []);
    for (const values of rows) list.push({ id: uid(), values });
  });
  if (missingRefs.length) {
    useUiStore
      .getState()
      .notify(translate('records.missingRefs', { names: formatList(missingRefs) }), 'error');
  } else if (rows.length < count) {
    useUiStore
      .getState()
      .notify(translate('records.partial', { added: rows.length, count }), 'error');
  }
  return rows.length;
};

export const randomizeCell = (tableId: string, rowId: string, columnId: string) => {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const value = randomCellValue(project, getDerived(project).schema, tableId, rowId, columnId);
  if (value === null) {
    useUiStore.getState().notify(translate('records.noValues'), 'error');
    return;
  }
  mutate((draft) => {
    const row = draft.records?.[tableId]?.find((r) => r.id === rowId);
    if (row) row.values[columnId] = value;
  });
};

export const clearRows = (tableId: string) =>
  mutate((draft) => {
    if (draft.records) delete draft.records[tableId];
  });

/* Project */

export const setDialect = (dialect: DialectId) => {
  let kept: string[] = [];
  mutate((draft) => {
    kept = changeDialect(draft, dialect).kept;
  });
  const { notify } = useUiStore.getState();
  notify(
    kept.length
      ? translate('actions.dialectChangedKept', { dialect: DIALECTS[dialect].name, kept: kept.join(', ') })
      : translate('actions.dialectChanged', { dialect: DIALECTS[dialect].name }),
  );
};

export const deleteSelection = () => {
  const { selection } = useUiStore.getState();
  if (!selection) return;
  if (selection.kind === 'entity') deleteEntity(selection.id);
  else deleteRelationship(selection.id);
};

export const setDatabaseName = (databaseName: string) =>
  mutate((draft) => {
    draft.databaseName = databaseName;
  }, 'database-name');

/**
 * Links an attribute of one entity to another entity as a foreign key: a one-to-many relationship
 * whose FK copies the attribute's type. A non-key attribute becomes UNIQUE, since a FK can only
 * point to a unique column. Returns the new relationship id.
 */
export const linkAttributeAsFk = (fromEntityId: string, attributeId: string, toEntityId: string) => {
  const project = useProjectStore.getState().project;
  const from = project?.entities.find((e) => e.id === fromEntityId);
  const to = project?.entities.find((e) => e.id === toEntityId);
  const attribute = from?.attributes.find((a) => a.id === attributeId);
  const { notify, select } = useUiStore.getState();
  if (!project || !from || !to || !attribute) return undefined;
  if (from.kind !== 'entity' || to.kind !== 'entity') {
    notify(translate('actions.fkOnlyEntities'), 'error');
    return undefined;
  }
  const keyAttributes = from.attributes.filter((a) => a.pk);
  const isWholeKey = attribute.pk && keyAttributes.length === 1;
  const madeUnique = !isWholeKey && !attribute.unique;
  const rel = createRelationship([from.id, to.id], '1:N');
  if (!isWholeKey) rel.participants[0].refAttributeId = attribute.id;
  mutate((draft) => {
    if (madeUnique) {
      const target = entityIn(draft, from.id)?.attributes.find((a) => a.id === attribute.id);
      if (target) target.unique = true;
    }
    draft.relationships.push(rel);
  });
  select({ kind: 'relationship', id: rel.id });
  const { schema } = getDerived(useProjectStore.getState().project!);
  const fk = schema.foreignKeys.find((f) => f.relationshipId === rel.id);
  const column = fk && schema.tables.find((t) => t.id === fk.tableId)?.columns.find((c) => c.id === fk.columnIds[0]);
  notify(
    translate('actions.fkCreated', { column: column?.name ?? '', table: to.name, source: `${from.name}.${attribute.name}` }) +
      (madeUnique ? translate('actions.fkMadeUnique', { name: attribute.name }) : ''),
  );
  return rel.id;
};
