import { useMemo } from 'react';
import { reviewDesign, type Finding } from '../../domain/design-review';
import useProjectStore from '../../stores/use-project-store';
import useDerived from './use-derived';

/** Design review findings of the open project, without the dismissed ones. */
const useDesignReview = (tableId?: string) => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  return useMemo(() => {
    if (!project || !derived) return { findings: [] as Finding[], dismissed: 0 };
    const all = reviewDesign(project, derived.schema).filter((f) => !tableId || f.tableId === tableId);
    const ignored = new Set(project.dismissedFindings ?? []);
    return { findings: all.filter((f) => !ignored.has(f.id)), dismissed: all.filter((f) => ignored.has(f.id)).length };
  }, [project, derived, tableId]);
};

export default useDesignReview;
