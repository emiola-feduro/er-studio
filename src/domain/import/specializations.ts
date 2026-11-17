import { buildSchema } from '../inference';
import { uid } from '../model';
import type { Project, Schema, Specialization } from '../types';

/**
 * Finds subclasses written as tables (table per type): a table whose whole key is a 1:1 identifying
 * FK to another table's key. They become a specialization only when the tables come out exactly as
 * in the script; a CHECK ... IN (...) column of the parent whose values are the subtable names
 * becomes its discriminator.
 */

const shape = (schema: Schema) =>
  schema.tables
    .map((t) => `${t.name}(${t.columns.map((c) => `${c.name}${c.pk ? '*' : ''}`).sort().join(',')})`)
    .sort()
    .join('\n');

export const detectSpecializations = (project: Project): number => {
  const before = shape(buildSchema(project));
  const candidates = project.relationships.filter((rel) => {
    // Its key is the FK, so it is 1:1 even when the script did not say UNIQUE.
    if (rel.participants.length !== 2 || rel.junctionId || !rel.identifying || rel.participants[0].cardinality !== '1') return false;
    const [parent, child] = rel.participants;
    const holder = project.entities.find((e) => e.id === child.entityId);
    return Boolean(holder) && parent.entityId !== child.entityId && !holder!.attributes.some((a) => a.pk);
  });
  if (candidates.length === 0) return 0;

  const bySuper = new Map<string, string[]>();
  for (const rel of candidates) bySuper.set(rel.participants[0].entityId, [...(bySuper.get(rel.participants[0].entityId) ?? []), rel.participants[1].entityId]);

  const draft = structuredClone(project);
  const ids = new Set(candidates.map((r) => r.id));
  draft.relationships = draft.relationships.filter((r) => !ids.has(r.id));
  draft.specializations = [...(draft.specializations ?? [])];
  for (const [supertypeId, subtypeIds] of bySuper) {
    const supertype = draft.entities.find((e) => e.id === supertypeId)!;
    const names = subtypeIds.map((id) => draft.entities.find((e) => e.id === id)!.name.toLowerCase());
    // An ENUM of the parent that lists exactly the subtables (in any case) says the subtype.
    const disc = supertype.attributes.find((a) => a.type.toUpperCase() === 'ENUM' && a.enumValues && names.every((n) => a.enumValues!.some((v) => v.toLowerCase() === n)));
    const spec: Specialization = { id: uid(), supertypeId, subtypeIds, total: Boolean(disc && !disc.nullable), disjoint: Boolean(disc), mapping: 'table-per-type' };
    if (disc) {
      spec.discriminator = {
        name: disc.name,
        values: Object.fromEntries(subtypeIds.map((id, i) => [id, disc.enumValues!.find((v) => v.toLowerCase() === names[i])!])),
      };
      supertype.attributes = supertype.attributes.filter((a) => a !== disc);
    }
    draft.specializations.push(spec);
  }

  // Only when nothing changes in the tables; otherwise the plain 1:1 relationships stay.
  if (shape(buildSchema(draft)) !== before) return 0;
  project.relationships = draft.relationships;
  project.specializations = draft.specializations;
  project.entities = draft.entities;
  return bySuper.size;
};
