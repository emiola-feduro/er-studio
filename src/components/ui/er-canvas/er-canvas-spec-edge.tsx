import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from '@xyflow/react';
import type { SpecEdgeType } from '../../../lib/graph';

/**
 * A line of a specialization. Supertype to circle is double when the specialization is total; circle
 * to subtype carries the subset sign, open toward the supertype.
 */
const ErCanvasSpecEdge = ({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SpecEdgeType>) => {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  if (!data) return null;
  const { part, total, highlighted } = data;
  const color = highlighted ? 'var(--c-edge-hl)' : 'var(--c-edge)';
  const width = highlighted ? 2.5 : 1.6;
  // Direction from the middle of the line toward the circle (the supertype side), in degrees.
  const angle = (Math.atan2(sourceY - targetY, sourceX - targetX) * 180) / Math.PI;

  return (
    <>
      {part === 'super' && total ? (
        <>
          {/* Two parallel lines: a wide stroke with a canvas colored stroke inside it. */}
          <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: width * 3.4 }} interactionWidth={16} />
          <path d={path} fill="none" style={{ stroke: 'var(--c-canvas)', strokeWidth: width * 1.4, pointerEvents: 'none' }} />
        </>
      ) : (
        <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: width }} interactionWidth={16} />
      )}
      {part === 'sub' && (
        <EdgeLabelRenderer>
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="-9 -9 18 18"
            className="nodrag nopan pointer-events-none absolute"
            style={{ transform: `translate(${labelX - 9}px, ${labelY - 9}px) rotate(${angle}deg)`, overflow: 'visible' }}
          >
            {/* A "⊂" whose arms point toward the supertype. */}
            <path d="M 6 -6 L 0 -6 A 6 6 0 0 0 0 6 L 6 6" fill="none" stroke={color} strokeWidth={2} />
          </svg>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default ErCanvasSpecEdge;
