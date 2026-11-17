import { t } from '../i18n';
import { createEntity, nextName, uid } from '../domain/model';
import type { Position, Project, Specialization } from '../domain/types';
import { estimatedNodeHeight, NODE_WIDTH } from './graph';
import useProjectStore from '../stores/use-project-store';
import useUiStore from '../stores/use-ui-store';

/** Commands on superclasses and subclasses. Each one is a single undoable step. */

const mutate = (change: (draft: Project) => void, key?: string) => useProjectStore.getState().mutate(change, key);
const specIn = (draft: Project, id: string) => draft.specializations?.find((s) => s.id === id);

/** The specialization whose supertype is this entity, if any. */
export const specializationOf = (project: Project, supertypeId: string) => project.specializations?.find((s) => s.supertypeId === supertypeId);

/** The specialization this entity is a subtype of, if any. */
export const supertypeSpecialization = (project: Project, entityId: string) => project.specializations?.find((s) => s.subtypeIds.includes(entityId));

export const createSpecialization = (supertypeId: string, subtypeIds: string[], patch: Partial<Specialization> = {}) => {
  const spec: Specialization = { id: uid(), supertypeId, subtypeIds: [...new Set(subtypeIds)], total: false, disjoint: true, mapping: 'table-per-type', ...patch };
  mutate((draft) => {
    draft.specializations = [...(draft.specializations ?? []), spec];
  });
  useUiStore.getState().select({ kind: 'specialization', id: spec.id });
  return spec.id;
};

export const updateSpecialization = (id: string, patch: Partial<Specialization>, key?: string) =>
  mutate((draft) => {
    const spec = specIn(draft, id);
    if (spec) Object.assign(spec, patch);
  }, key);

export const addSubtype = (id: string, entityId: string) =>
  mutate((draft) => {
    const spec = specIn(draft, id);
    if (spec && !spec.subtypeIds.includes(entityId) && entityId !== spec.supertypeId) spec.subtypeIds.push(entityId);
  });

export const removeSubtype = (id: string, entityId: string) =>
  mutate((draft) => {
    const spec = specIn(draft, id);
    if (!spec) return;
    spec.subtypeIds = spec.subtypeIds.filter((s) => s !== entityId);
    if (spec.discriminator) delete spec.discriminator.values[entityId];
  });

export const deleteSpecialization = (id: string) => {
  mutate((draft) => {
    draft.specializations = (draft.specializations ?? []).filter((s) => s.id !== id);
  });
  const { selection, select } = useUiStore.getState();
  if (selection?.id === id) select(null);
};

const MARGIN = 40;

/** First spot under the supertype where a new box does not cover another one, going right and then down. */
const freeSpotBelow = (project: Project, supertypeId: string, siblings: number): Position => {
  const boxes = project.entities.map((e) => ({ ...e.position, height: estimatedNodeHeight(e.attributes.length + 1) }));
  const supertype = project.entities.find((e) => e.id === supertypeId)!;
  const height = estimatedNodeHeight(1);
  const overlaps = (x: number, y: number) =>
    boxes.some((b) => x < b.x + NODE_WIDTH + MARGIN && x + NODE_WIDTH + MARGIN > b.x && y < b.y + b.height + MARGIN && y + height + MARGIN > b.y);
  const startY = supertype.position.y + estimatedNodeHeight(supertype.attributes.length) + 130;
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const x = supertype.position.x + (siblings + col) * (NODE_WIDTH + MARGIN);
      const y = startY + row * (height + 2 * MARGIN);
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return { x: supertype.position.x, y: startY };
};

/**
 * A new entity below the given one, already its subclass. It has no key of its own: with a table per
 * type it takes the supertype's key.
 */
export const createSubtypeOf = (supertypeId: string) => {
  const project = useProjectStore.getState().project;
  const supertype = project?.entities.find((e) => e.id === supertypeId);
  if (!project || !supertype) return;
  const name = nextName(t('spec.newSubtype', { name: supertype.name }), project.entities.map((e) => e.name));
  const siblings = specializationOf(project, supertypeId)?.subtypeIds.length ?? 0;
  const position = freeSpotBelow(project, supertypeId, siblings);
  const entity = { ...createEntity(project.dialect, name, position), attributes: [] };
  mutate((draft) => {
    draft.entities.push(entity);
    const existing = draft.specializations?.find((s) => s.supertypeId === supertypeId);
    if (existing) existing.subtypeIds.push(entity.id);
    else draft.specializations = [...(draft.specializations ?? []), { id: uid(), supertypeId, subtypeIds: [entity.id], total: false, disjoint: true, mapping: 'table-per-type' }];
  });
  useUiStore.getState().select({ kind: 'entity', id: entity.id });
};

/** Removes an entity from every specialization; one left without subtypes, or without supertype, goes. */
export const forgetEntityInSpecializations = (draft: Project, entityId: string) => {
  if (!draft.specializations) return;
  draft.specializations = draft.specializations
    .filter((s) => s.supertypeId !== entityId)
    .map((s) => ({ ...s, subtypeIds: s.subtypeIds.filter((id) => id !== entityId) }))
    .filter((s) => s.subtypeIds.length > 0);
};
