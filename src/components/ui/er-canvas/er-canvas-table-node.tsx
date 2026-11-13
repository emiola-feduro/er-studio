import useT from '../../../hooks/ui/use-t';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TableNodeType } from '../../../lib/graph';
import { NODE_WIDTH } from '../../../lib/graph';
import ErCanvasTableRow from './er-canvas-table-row';

const ErCanvasTableNode = ({ data, selected }: NodeProps<TableNodeType>) => {
  const t = useT();
  const { table, dialect, color, kindLabel, highlighted, indexedColumnIds, issueCount } = data;
  const { name, kind, columns } = table;
  const isJunction = kind === 'junction';
  const headerStyle = color && !isJunction ? { background: color, color: '#111' } : undefined;

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`overflow-hidden rounded-theme border-(length:--bw) bg-node shadow-theme ${isJunction ? 'border-dashed' : ''} ${selected ? 'border-accent outline-2 outline-accent' : 'border-node-border'}`}
    >
      <div
        style={headerStyle}
        className={`flex items-center gap-2 px-3 py-2 ${isJunction ? 'bg-junction-header text-junction-header-fg' : 'bg-node-header text-node-header-fg'}`}
      >
        {isJunction && <span aria-hidden className="size-2.5 shrink-0 rotate-45 border-2 border-current" />}
        <span className="min-w-0 flex-1 truncate font-semibold" title={name}>
          {name || t('common.unnamed')}
        </span>
        {kindLabel && <span className="shrink-0 text-[11px] font-medium opacity-80">{kindLabel}</span>}
        {issueCount > 0 && (
          <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger" title={t('common.warningsCount', { count: issueCount })}>
            {issueCount}
          </span>
        )}
      </div>
      <div className="py-1">
        {columns.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">{t('canvas.noColumns')}</p>}
        {columns.map((column) => (
          <ErCanvasTableRow
            key={column.id}
            column={column}
            dialect={dialect}
            highlighted={highlighted.includes(column.id)}
            indexed={indexedColumnIds.includes(column.id)}
            linkable={!isJunction}
          />
        ))}
      </div>
      {!isJunction && (
        <Handle
          id="connect"
          type="source"
          position={Position.Right}
          className="connect-handle"
          style={{ top: 18 }}
          title={t('canvas.connectHint')}
        />
      )}
    </div>
  );
};

export default ErCanvasTableNode;
