import { useEffect } from 'react';
import useProjectStore from '../../stores/use-project-store';

let started = false;

/** Loads the project list from IndexedDB once and reports the load status. */
const useProjectBootstrap = () => {
  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);

  useEffect(() => {
    if (started) return;
    started = true;
    void useProjectStore.getState().init();
  }, []);

  const retry = () => {
    useProjectStore.setState({ status: 'loading', error: undefined });
    void useProjectStore.getState().init();
  };

  return { status, error, retry };
};

export default useProjectBootstrap;
