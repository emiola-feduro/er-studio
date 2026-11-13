import { useMemo } from 'react';
import { getDdl, getDerived } from '../../lib/derived';
import usePreferencesStore from '../../stores/use-preferences-store';
import useProjectStore from '../../stores/use-project-store';

/** Physical schema and validation issues for the open project. */
const useDerived = () => {
  const project = useProjectStore((s) => s.project);
  // Issues are written in the current language, so a language change recomputes them.
  const locale = usePreferencesStore((s) => s.locale);
  return useMemo(() => (project ? getDerived(project) : null), [project, locale]);
};

export const useDdl = () => {
  const project = useProjectStore((s) => s.project);
  const locale = usePreferencesStore((s) => s.locale);
  return useMemo(() => (project ? getDdl(project) : null), [project, locale]);
};

export default useDerived;
