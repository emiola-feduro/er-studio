import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { moveEntities } from '../../lib/actions';
import { NODE_WIDTH } from '../../lib/graph';
import { layoutTables } from '../../lib/layout';

/** Arranges tables left to right with dagre and saves the positions as one undo step. */
const useAutoLayout = () => {
  const { getNodes, getEdges, fitView } = useReactFlow();

  return useCallback(() => {
    const nodes = getNodes();
    if (nodes.length === 0) return;
    const positions = layoutTables(
      nodes.map((n) => ({ id: n.id, width: n.measured?.width ?? NODE_WIDTH, height: n.measured?.height ?? 160 })),
      getEdges().map((e) => [e.target, e.source]),
    );
    moveEntities([...positions].map(([id, position]) => ({ id, position })));
    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 250 }));
  }, [getNodes, getEdges, fitView]);
};

export default useAutoLayout;
