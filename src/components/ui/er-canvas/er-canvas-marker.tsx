import type { EndMarker } from '../../../domain/types';

type ErCanvasMarkerProps = {
  id: string;
  kind: EndMarker;
  color: string;
};

/**
 * Crow's foot marker drawn for a path that ends at the entity border (x = 24).
 * The same shape is reused at the start of the path with orient="auto-start-reverse".
 */
const ErCanvasMarker = ({ id, kind, color }: ErCanvasMarkerProps) => {
  const stroke = { stroke: color, strokeWidth: 1.6, fill: 'none' };
  const crow = (
    <>
      <line x1="12" y1="12" x2="24" y2="4" {...stroke} />
      <line x1="12" y1="12" x2="24" y2="20" {...stroke} />
      <line x1="12" y1="12" x2="24" y2="12" {...stroke} />
    </>
  );
  const circle = (cx: number) => <circle cx={cx} cy="12" r="3.5" style={{ fill: 'var(--c-canvas)' }} stroke={color} strokeWidth={1.6} />;

  return (
    <marker
      id={id}
      viewBox="0 0 24 24"
      refX="24"
      refY="12"
      markerWidth="24"
      markerHeight="24"
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      {kind === 'one' && (
        <>
          <line x1="15" y1="5" x2="15" y2="19" {...stroke} />
          <line x1="19" y1="5" x2="19" y2="19" {...stroke} />
        </>
      )}
      {kind === 'zeroOrOne' && (
        <>
          {circle(8)}
          <line x1="17" y1="5" x2="17" y2="19" {...stroke} />
        </>
      )}
      {kind === 'many' && (
        <>
          <line x1="8" y1="5" x2="8" y2="19" {...stroke} />
          {crow}
        </>
      )}
      {kind === 'zeroOrMany' && (
        <>
          {circle(6)}
          {crow}
        </>
      )}
    </marker>
  );
};

export default ErCanvasMarker;
