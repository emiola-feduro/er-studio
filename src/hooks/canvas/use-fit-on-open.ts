import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import useProjectStore from '../../stores/use-project-store';

/** Fits the whole diagram in view each time another project opens, once its own tables are measured. */
const useFitOnOpen = () => {
  const project = useProjectStore((s) => s.project);
  const initialized = useNodesInitialized();
  const { fitView, getNodes } = useReactFlow();
  const fittedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!project || !initialized || fittedId.current === project.id) return;
    // Right after a switch the canvas still holds the previous project's nodes.
    const ids = new Set(project.entities.map((e) => e.id));
    const nodes = getNodes();
    if (nodes.length !== ids.size || !nodes.every((n) => ids.has(n.id))) return;
    fittedId.current = project.id;
    requestAnimationFrame(() => void fitView({ padding: 0.15 }));
  }, [project, initialized, fitView, getNodes]);
};

export default useFitOnOpen;
