import { Handle, Position } from '@xyflow/react';
import { displayType } from '../../../domain/dialects';
import type { Column, DialectId } from '../../../domain/types';
import { ATTR_HANDLE_PREFIX, handleId } from '../../../lib/graph';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useUiStore from '../../../stores/use-ui-store';
import ConstraintIcons, { CONSTRAINTS, type ConstraintKind } from '../constraint-icons/constraint-icons';

type ErCanvasTableRowProps = {
  column: Column;
  dialect: DialectId;
  highlighted: boolean;
  indexed: boolean;
  /** Attribute rows of regular entities can be dragged onto another entity to create a FK. */
  linkable: boolean;
};

const ErCanvasTableRow = ({ column, dialect, highlighted, indexed, linkable }: ErCanvasTableRowProps) => {
  const { id, name, pk, origin, nullable, unique, autoIncrement, fkId } = column;
  const isFk = origin === 'fk';
  const setHoveredFk = useUiStore((s) => s.setHoveredFk);
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);

  const keys: ConstraintKind[] = [pk && 'pk', isFk && 'fk'].filter(Boolean) as ConstraintKind[];
  const flags: ConstraintKind[] = [!nullable && !pk && 'nn', unique && 'uq', autoIncrement && 'ai', indexed && 'ix'].filter(
    Boolean,
  ) as ConstraintKind[];
  const keyText = pk && isFk ? 'PF' : pk ? 'PK' : isFk ? 'FK' : '';

  return (
    <div
      className={`attr-row relative flex items-center gap-2 px-3 py-[5px] text-[12px] leading-tight ${highlighted ? 'bg-accent-soft' : ''}`}
      onMouseEnter={fkId ? () => setHoveredFk(fkId) : undefined}
      onMouseLeave={fkId ? () => setHoveredFk(null) : undefined}
    >
      <Handle id={handleId(id, 'L', 's')} type="source" position={Position.Left} className="column-handle" isConnectable={false} />
      <Handle id={handleId(id, 'L', 't')} type="target" position={Position.Left} className="column-handle" isConnectable={false} />
      <span className="flex w-7 shrink-0">
        {showIcons ? (
          <ConstraintIcons kinds={keys} size={13} />
        ) : (
          keyText && (
            <span className={`text-[10px] font-bold ${pk ? CONSTRAINTS.pk.className : CONSTRAINTS.fk.className}`}>{keyText}</span>
          )
        )}
      </span>
      <span className={`min-w-0 flex-1 truncate ${pk ? 'font-semibold' : ''} ${isFk ? 'text-fk' : ''}`} title={name}>
        {name}
      </span>
      <span className="shrink-0 text-muted">{displayType(dialect, column)}</span>
      {flags.length > 0 &&
        (showIcons ? (
          <ConstraintIcons kinds={flags} />
        ) : (
          <span className="shrink-0 text-[10px] font-semibold text-muted">{flags.map((k) => CONSTRAINTS[k].text).join(' ')}</span>
        ))}
      <Handle id={handleId(id, 'R', 's')} type="source" position={Position.Right} className="column-handle" isConnectable={false} />
      <Handle id={handleId(id, 'R', 't')} type="target" position={Position.Right} className="column-handle" isConnectable={false} />
      {linkable && origin === 'attribute' && (
        <Handle
          id={`${ATTR_HANDLE_PREFIX}${id}`}
          type="source"
          position={Position.Right}
          className="attr-handle"
          title={`Arrastra ${name} hasta otra entidad para crear una FK`}
        />
      )}
    </div>
  );
};

export default ErCanvasTableRow;
