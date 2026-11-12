import { useMemo } from 'react';
import { getDdl, getDerived } from '../../lib/derived';
import useProjectStore from '../../stores/use-project-store';

/** Physical schema and validation issues for the open project. */
const useDerived = () => {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => (project ? getDerived(project) : null), [project]);
};

export const useDdl = () => {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => (project ? getDdl(project) : null), [project]);
};

export default useDerived;
