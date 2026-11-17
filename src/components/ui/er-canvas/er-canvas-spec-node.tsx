import { Handle, Position, type NodeProps } from '@xyflow/react';
import useT from '../../../hooks/ui/use-t';
import { SPEC_NODE_SIZE, type SpecNodeType } from '../../../lib/graph';

/** The EER circle of a specialization: "d" when disjoint, "o" when overlapping. */
const ErCanvasSpecNode = ({ data, selected }: NodeProps<SpecNodeType>) => {
  const t = useT();
  const { disjoint, total, supertypeName, highlighted } = data;
  const active = selected || highlighted;

  return (
    <div
      role="img"
      aria-label={`${t('spec.circleLabel', { name: supertypeName })}: ${t(disjoint ? 'spec.disjointShort' : 'spec.overlappingShort')}${total ? ', total' : ''}`}
      style={{ width: SPEC_NODE_SIZE, height: SPEC_NODE_SIZE, borderColor: active ? 'var(--c-edge-hl)' : 'var(--c-edge)' }}
      className={`flex items-center justify-center rounded-full border-2 bg-node font-canvas text-[15px] font-bold text-fg shadow-theme ${active ? 'outline-2 outline-accent' : ''}`}
    >
      {disjoint ? 'd' : 'o'}
      {/* Both anchors sit at the center, so every line points at the middle of the circle. */}
      <Handle id="in" type="target" position={Position.Top} isConnectable={false} className="spec-handle" style={{ top: '50%', left: '50%' }} />
      <Handle id="out" type="source" position={Position.Bottom} isConnectable={false} className="spec-handle" style={{ top: '50%', left: '50%' }} />
    </div>
  );
};

export default ErCanvasSpecNode;
