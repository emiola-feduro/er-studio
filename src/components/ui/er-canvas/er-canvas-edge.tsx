import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { FkEdgeType } from '../../../lib/graph';
import ErCanvasMarker from './er-canvas-marker';

const ErCanvasEdge = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FkEdgeType>) => {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: source === target ? 36 : 28,
  });
  // A self reference loops on the table's right side, so its label goes beside the loop instead of on top of the table.
  const labelAnchor = source === target ? 'translate(6px, -50%)' : 'translate(-50%, -50%)';
  if (!data) return null;
  const { fk, holderEnd, refEnd, highlighted, showLabel } = data;
  const { name, onDelete, onUpdate } = fk;
  const color = highlighted ? 'var(--c-edge-hl)' : 'var(--c-edge)';
  const startId = `m-${id}-start`;
  const endId = `m-${id}-end`;
  const actions = [onDelete !== 'NO ACTION' && `ON DELETE ${onDelete}`, onUpdate !== 'NO ACTION' && `ON UPDATE ${onUpdate}`].filter(Boolean);

  return (
    <>
      <defs>
        <ErCanvasMarker id={startId} kind={holderEnd} color={color} />
        <ErCanvasMarker id={endId} kind={refEnd} color={color} />
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerStart={`url(#${startId})`}
        markerEnd={`url(#${endId})`}
        className={`er-edge-path ${highlighted ? 'is-hl' : ''}`}
        style={{ stroke: color, strokeWidth: highlighted ? 2.5 : 1.6 }}
        interactionWidth={16}
      />
      {(showLabel || highlighted) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-[calc(var(--radius)*0.5)] border border-line bg-surface px-1.5 py-0.5 font-canvas text-[11px] leading-tight text-muted"
            style={{
              transform: `translate(${labelX}px, ${labelY}px) ${labelAnchor}`,
              borderColor: highlighted ? 'var(--c-edge-hl)' : undefined,
              color: highlighted ? 'var(--c-fg)' : undefined,
            }}
          >
            <div className="font-semibold">{name}</div>
            {actions.map((action) => (
              <div key={String(action)}>{action}</div>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default ErCanvasEdge;
