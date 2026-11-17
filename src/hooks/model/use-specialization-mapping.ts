import { useState } from 'react';
import { buildSchema } from '../../domain/inference';
import type { Specialization, SpecializationMapping } from '../../domain/types';
import { updateSpecialization } from '../../lib/specialization-actions';
import useProjectStore from '../../stores/use-project-store';

/**
 * Changes how a specialization becomes tables. When that leaves a table with records out of the
 * schema, it asks first: the records are kept, only hidden until the mapping comes back.
 */
const useSpecializationMapping = (spec: Specialization) => {
  const project = useProjectStore((s) => s.project);
  const [pending, setPending] = useState<{ mapping: SpecializationMapping; tables: string[] } | null>(null);

  const request = (mapping: SpecializationMapping) => {
    if (!project || mapping === spec.mapping) return;
    const before = buildSchema(project).tables;
    const next = structuredClone(project);
    next.specializations = (next.specializations ?? []).map((s) => (s.id === spec.id ? { ...s, mapping } : s));
    const after = new Set(buildSchema(next).tables.map((t) => t.id));
    const hidden = before.filter((t) => !after.has(t.id) && (project.records?.[t.id]?.length ?? 0) > 0).map((t) => t.name);
    if (hidden.length) setPending({ mapping, tables: hidden });
    else updateSpecialization(spec.id, { mapping });
  };

  return {
    request,
    pending,
    confirm: () => {
      if (pending) updateSpecialization(spec.id, { mapping: pending.mapping });
      setPending(null);
    },
    cancel: () => setPending(null),
  };
};

export default useSpecializationMapping;
