import { t, type Locale } from '../i18n';
import { DIALECTS, ENUM_TYPE, quoteIdent, quoteLiteral } from './dialects';
import type { Attribute, DialectId, Entity, Issue, Participant, Project, Relationship, Specialization } from './types';

/**
 * Turns generalization and specialization into plain entities and relationships, so the rest of the
 * app (schema, DDL, records, queries, migrations) works on tables as usual. Ids stay stable, so
 * records and migrations survive a change of mapping:
 *
 * - table per type: each subtype keeps its table, whose key is a FK to the supertype's key (a 1:1
 *   identifying relationship with id "spec:{spec}:{subtype}");
 * - single table: subtype attributes move into the supertype table as nullable columns, kept
 *   consistent with the subtype by CHECK constraints;
 * - table per concrete subtype: each subtype copies the supertype's attributes; a total
 *   specialization leaves the supertype without a table of its own.
 *
 * A disjoint specialization adds a discriminator column (ENUM) to the supertype; an overlapping one
 * in a single table adds a boolean flag per subtype.
 */

export type TableCheck = { name: string; expression: string };

export type Lowered = {
  project: Project;
  /** CHECK constraints per table id. */
  checks: Map<string, TableCheck[]>;
  issues: Issue[];
};

export const specializationRelId = (specId: string, subtypeId: string) => `spec:${specId}:${subtypeId}`;
export const discriminatorAttrId = (specId: string) => `disc:${specId}`;
export const flagAttrId = (specId: string, subtypeId: string) => `flag:${specId}:${subtypeId}`;
export const copiedAttrId = (subtypeId: string, attrId: string) => `${subtypeId}:${attrId}`;

const DISCRIMINATOR_NAME: Record<Locale, string> = { es: 'tipo', en: 'type', fr: 'type', pt: 'tipo' };
const FLAG_PREFIX: Record<Locale, string> = { es: 'es_', en: 'is_', fr: 'est_', pt: 'e_' };

export const defaultDiscriminatorName = (locale: Locale = 'es') => DISCRIMINATOR_NAME[locale];

/** Discriminator name and value of each subtype: the typed ones, else "tipo" and the subtype's name. */
export const discriminatorOf = (spec: Specialization, entities: Entity[], locale: Locale = 'es') => {
  const values: Record<string, string> = {};
  for (const id of spec.subtypeIds) {
    values[id] = spec.discriminator?.values[id]?.trim() || entities.find((e) => e.id === id)?.name || id;
  }
  return { name: spec.discriminator?.name?.trim() || defaultDiscriminatorName(locale), values };
};

const boolLiterals = (dialect: DialectId) => (dialect === 'sqlserver' || dialect === 'oracle' ? ['1', '0'] : ['TRUE', 'FALSE']);

/** Problems that make a specialization unusable; those specializations are left out of the tables. */
export const specializationProblems = (project: Project): Issue[] => {
  const issues: Issue[] = [];
  const specs = project.specializations ?? [];
  const byId = new Map(project.entities.map((e) => [e.id, e]));
  const name = (id: string) => byId.get(id)?.name || id;
  const parents = new Map<string, string[]>();
  for (const spec of specs) {
    const issue = (key: Parameters<typeof t>[0], params: Record<string, string> = {}, level: Issue['level'] = 'error') =>
      issues.push({ level, message: t(key, params), specializationId: spec.id, entityId: spec.supertypeId });
    const supertype = byId.get(spec.supertypeId);
    if (!supertype) {
      issue('spec.missingSupertype');
      continue;
    }
    if (supertype.kind === 'junction') issue('spec.junction', { name: supertype.name });
    if (spec.subtypeIds.length === 0) issue('spec.noSubtypes', { name: supertype.name }, 'warning');
    for (const id of spec.subtypeIds) {
      const sub = byId.get(id);
      if (!sub) continue;
      if (id === spec.supertypeId) issue('spec.selfSubtype', { name: sub.name });
      if (sub.kind === 'junction') issue('spec.junction', { name: sub.name });
      parents.set(id, [...(parents.get(id) ?? []), spec.supertypeId]);
    }
    if (!supertype.attributes.some((a) => a.pk)) issue('spec.supertypeNoPk', { name: supertype.name });
  }
  for (const [id, supers] of parents) {
    if (supers.length > 1) {
      issues.push({ level: 'error', message: t('spec.multipleSupertypes', { name: name(id), supertypes: supers.map(name).join(', ') }), entityId: id });
    }
  }
  // A cycle: following supertypes from an entity comes back to it.
  for (const start of parents.keys()) {
    const seen = new Set<string>([start]);
    let current = parents.get(start)?.[0];
    while (current) {
      if (seen.has(current)) {
        if (current === start) issues.push({ level: 'error', message: t('spec.cycle', { name: name(start) }), entityId: start });
        break;
      }
      seen.add(current);
      current = parents.get(current)?.[0];
    }
  }
  return issues;
};

export const lowerSpecializations = (source: Project): Lowered => {
  const specs = source.specializations ?? [];
  const checks = new Map<string, TableCheck[]>();
  if (specs.length === 0) return { project: source, checks, issues: [] };

  const problems = specializationProblems(source);
  const broken = new Set(problems.filter((p) => p.level === 'error' && p.specializationId).map((p) => p.specializationId!));
  const brokenEntities = new Set(problems.filter((p) => p.level === 'error' && !p.specializationId).map((p) => p.entityId));
  const issues: Issue[] = [...problems];

  const project: Project = structuredClone({ ...source, specializations: undefined });
  const locale = source.namesLocale ?? 'es';
  const dialect = source.dialect;
  const q = (name: string) => quoteIdent(dialect, name);
  const [TRUE, FALSE] = boolLiterals(dialect);
  const entity = (id: string) => project.entities.find((e) => e.id === id);
  const addCheck = (tableId: string, check: TableCheck) => checks.set(tableId, [...(checks.get(tableId) ?? []), check]);
  const removed = new Map<string, string>(); // entity id -> table that took its place

  // Supertypes first, so a subtype that is also a supertype is lowered after its own parent.
  const depth = (spec: Specialization): number => {
    const parent = specs.find((s) => s.subtypeIds.includes(spec.supertypeId));
    return parent && parent !== spec ? depth(parent) + 1 : 0;
  };
  const ordered = specs.filter((s) => !broken.has(s.id) && !s.subtypeIds.some((id) => brokenEntities.has(id))).sort((a, b) => depth(a) - depth(b));

  for (const spec of ordered) {
    const supertype = entity(removed.get(spec.supertypeId) ?? spec.supertypeId);
    if (!supertype) continue;
    const subtypes = spec.subtypeIds.map(entity).filter((e): e is Entity => Boolean(e) && e!.id !== supertype.id);
    if (subtypes.length === 0) continue;
    const superKey = supertype.attributes.filter((a) => a.pk);
    const disc = discriminatorOf(spec, source.entities, locale);
    // An attribute of a subtype named like one of the supertype is that same inherited attribute.
    const superNames = new Set(supertype.attributes.map((a) => a.name.toLowerCase()));
    for (const sub of subtypes) sub.attributes = sub.attributes.filter((a) => !superNames.has(a.name.toLowerCase()));

    // Discriminator: an ENUM column in the supertype with one value per subtype.
    const addDiscriminator = () => {
      if (!spec.disjoint) return undefined;
      const attr: Attribute = {
        id: discriminatorAttrId(spec.id),
        name: disc.name,
        type: ENUM_TYPE,
        enumValues: subtypes.map((s) => disc.values[s.id]),
        pk: false,
        nullable: !spec.total,
        unique: false,
        autoIncrement: false,
      };
      supertype.attributes.push(attr);
      return attr;
    };

    if (spec.mapping === 'table-per-type') {
      addDiscriminator();
      for (const sub of subtypes) {
        // The subtype's key is the supertype's key; a key of its own stays as UNIQUE.
        const ownKey = sub.attributes.filter((a) => a.pk);
        if (ownKey.length) {
          issues.push({ level: 'warning', message: t('spec.subtypeOwnKey', { name: sub.name, supertype: supertype.name }), entityId: sub.id, specializationId: spec.id });
          for (const a of ownKey) Object.assign(a, { pk: false, unique: true, autoIncrement: false });
        }
        const superParticipant: Participant = {
          id: `${specializationRelId(spec.id, sub.id)}:super`,
          entityId: supertype.id,
          cardinality: '1',
          optional: false,
          fkColumnNames: superKey.map((a) => a.name),
          constraintName: `fk_${sub.name}_${supertype.name}`,
        };
        const relationship: Relationship = {
          id: specializationRelId(spec.id, sub.id),
          participants: [superParticipant, { id: `${specializationRelId(spec.id, sub.id)}:sub`, entityId: sub.id, cardinality: '1', optional: true }],
          identifying: true,
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        };
        project.relationships.push(relationship);
      }
      continue;
    }

    if (spec.mapping === 'single-table') {
      const discriminator = addDiscriminator();
      const discRef = discriminator ? `COALESCE(${q(discriminator.name)}, '')` : '';
      for (const sub of subtypes) {
        const value = quoteLiteral(disc.values[sub.id]);
        let flag: Attribute | undefined;
        if (!spec.disjoint) {
          const typeDef = DIALECTS[dialect].map.bool;
          flag = {
            id: flagAttrId(spec.id, sub.id),
            name: `${FLAG_PREFIX[locale]}${sub.name}`,
            type: typeDef.type,
            precision: typeDef.precision,
            scale: typeDef.scale,
            pk: false,
            nullable: false,
            unique: false,
            autoIncrement: false,
            defaultValue: FALSE,
          };
          supertype.attributes.push(flag);
        }
        // "This row is of the subtype": the discriminator says so, or its flag is on.
        const isSub = discriminator ? `${discRef} = ${value}` : `${q(flag!.name)} = ${TRUE}`;
        const isNotSub = discriminator ? `${discRef} <> ${value}` : `${q(flag!.name)} = ${FALSE}`;
        for (const attr of sub.attributes) {
          if (attr.pk) {
            issues.push({ level: 'warning', message: t('spec.singleTableKey', { name: `${sub.name}.${attr.name}`, supertype: supertype.name }), entityId: sub.id, specializationId: spec.id });
            continue;
          }
          supertype.attributes.push({ ...attr, nullable: true, unique: attr.unique });
          const column = q(attr.name);
          addCheck(supertype.id, { name: `ck_${supertype.name}_${attr.name}_${sub.name}`, expression: `${column} IS NULL OR ${isSub}` });
          if (!attr.nullable) addCheck(supertype.id, { name: `ck_${supertype.name}_${attr.name}_req`, expression: `${isNotSub} OR ${column} IS NOT NULL` });
        }
        // Indexes and relationships of the subtype now belong to the supertype's table.
        supertype.indexes.push(...sub.indexes);
        // A FK the subtype held is now in the supertype's table, where rows of other subtypes leave it empty.
        for (const rel of project.relationships) {
          if (!rel.participants.some((p) => p.entityId === sub.id)) continue;
          if (rel.participants.length === 2 && !rel.junctionId) {
            const [a, b] = rel.participants;
            const [parent, child] = a.cardinality === 'N' && b.cardinality === '1' ? [b, a] : [a, b];
            if (child.entityId === sub.id) parent.optional = true;
          }
          for (const p of rel.participants) if (p.entityId === sub.id) p.entityId = supertype.id;
        }
        project.entities = project.entities.filter((e) => e.id !== sub.id);
        removed.set(sub.id, supertype.id);
      }
      if (spec.total && !spec.disjoint) {
        const flags = subtypes.map((s) => `${q(`${FLAG_PREFIX[locale]}${s.name}`)} = ${TRUE}`).join(' OR ');
        addCheck(supertype.id, { name: `ck_${supertype.name}_${disc.name}_total`, expression: flags });
      }
      continue;
    }

    // Table per concrete subtype: each subtype copies the supertype's attributes.
    for (const sub of subtypes) {
      const copies = supertype.attributes.map((a) => ({ ...a, id: copiedAttrId(sub.id, a.id) }));
      if (copies.some((c) => c.pk)) for (const a of sub.attributes) if (a.pk) Object.assign(a, { pk: false, unique: true, autoIncrement: false });
      sub.attributes = [...copies, ...sub.attributes];
    }
    if (spec.total) {
      // The supertype has no table: what pointed to it cannot be a FK; what it pointed to is inherited.
      const kept: Relationship[] = [];
      for (const rel of project.relationships) {
        const own = rel.participants.filter((p) => p.entityId === supertype.id);
        if (own.length === 0) {
          kept.push(rel);
          continue;
        }
        const binary = rel.participants.length === 2 && !rel.junctionId;
        const holds = binary && (() => {
          const [a, b] = rel.participants;
          const child = a.cardinality === 'N' && b.cardinality === '1' ? a : b;
          return child.entityId === supertype.id && rel.participants.filter((p) => p.entityId === supertype.id).length === 1;
        })();
        if (!holds) {
          issues.push({ level: 'error', message: t('spec.abstractReferenced', { name: supertype.name }), relationshipId: rel.id, specializationId: spec.id });
          continue;
        }
        for (const sub of subtypes) {
          kept.push({
            ...structuredClone(rel),
            id: `${rel.id}:${sub.id}`,
            participants: rel.participants.map((p) => ({ ...p, id: `${p.id}:${sub.id}`, entityId: p.entityId === supertype.id ? sub.id : p.entityId })),
          });
        }
      }
      project.relationships = kept;
      project.entities = project.entities.filter((e) => e.id !== supertype.id);
    }
  }

  return { project, checks, issues };
};
