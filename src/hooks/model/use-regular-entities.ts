import { useMemo } from 'react';
import type { Entity } from '../../domain/types';
import useProjectStore from '../../stores/use-project-store';

const EMPTY: Entity[] = [];

/** Entities of the open project, without junction tables. */
const useRegularEntities = () => {
  const entities = useProjectStore((s) => s.project?.entities ?? EMPTY);
  return useMemo(() => entities.filter((e) => e.kind === 'entity'), [entities]);
};

export default useRegularEntities;
