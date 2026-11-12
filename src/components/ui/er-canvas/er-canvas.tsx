import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import useDiagramGraph from '../../../hooks/canvas/use-diagram-graph';
import useFitOnOpen from '../../../hooks/canvas/use-fit-on-open';
import { getTheme } from '../../../lib/themes/themes';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useUiStore from '../../../stores/use-ui-store';
import ErCanvasContextMenu from './er-canvas-context-menu';
import ErCanvasEdge from './er-canvas-edge';
import ErCanvasEmpty from './er-canvas-empty';
import ErCanvasLegend from './er-canvas-legend';
import ErCanvasTableNode from './er-canvas-table-node';
import ErCanvasToolbar from './er-canvas-toolbar';

const nodeTypes = { table: ErCanvasTableNode };
const edgeTypes = { fk: ErCanvasEdge };

const patterns = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
} as const;

const ErCanvas = () => {
  const graph = useDiagramGraph();
  useFitOnOpen();
  const { nodes, edges, ...handlers } = graph;
  const themeId = usePreferencesStore((s) => s.themeId);
  const { pattern, dark } = getTheme(themeId);
  const focusMode = useUiStore((s) => s.focusMode);

  return (
    <div className="relative h-full w-full bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={dark ? 'dark' : 'light'}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        {...handlers}
      >
        {pattern !== 'none' && (
          <Background variant={patterns[pattern]} gap={pattern === 'dots' ? 18 : 24} size={pattern === 'dots' ? 1.4 : 1} color="var(--c-grid)" />
        )}
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--c-node-header)"
          nodeStrokeColor="var(--c-node-border)"
          maskColor="color-mix(in srgb, var(--c-canvas) 70%, transparent)"
          position="bottom-right"
        />
        {!focusMode && <ErCanvasToolbar />}
        <ErCanvasLegend />
        <ErCanvasContextMenu />
      </ReactFlow>
      {nodes.length === 0 && <ErCanvasEmpty />}
    </div>
  );
};

export default ErCanvas;
