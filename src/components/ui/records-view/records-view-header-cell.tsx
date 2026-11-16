import useT from '../../../hooks/ui/use-t';
import type { Column, DialectId } from '../../../domain/types';
import { columnTypeLabel } from '../../../lib/record-inputs';
import usePreferencesStore from '../../../stores/use-preferences-store';
import ColumnResizeHandle from '../column-resize-handle/column-resize-handle';
import ConstraintIcons, { CONSTRAINTS, type ConstraintKind } from '../constraint-icons/constraint-icons';

type RecordsViewHeaderCellProps = {
  column: Column;
  dialect: DialectId;
  refTable?: string;
  width: number;
  onResize: (width: number) => void;
  onFit: () => void;
};

const RecordsViewHeaderCell = ({ column, dialect, refTable, width, onResize, onFit }: RecordsViewHeaderCellProps) => {
  const t = useT();
  const { name, pk, origin, nullable, unique, autoIncrement } = column;
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);
  const kinds = [pk && 'pk', origin === 'fk' && 'fk', !nullable && !pk && 'nn', unique && 'uq', autoIncrement && 'ai'].filter(
    Boolean,
  ) as ConstraintKind[];

  return (
    <th scope="col" className="relative overflow-hidden border-b border-l border-line px-2 py-2 text-left align-bottom font-normal">
      <span className={`block truncate font-semibold ${origin === 'fk' ? 'text-fk' : ''}`} title={name}>
        {name}
      </span>
      <span className="flex items-center gap-1.5 text-[0.92em] text-muted">
        {columnTypeLabel(dialect, column)}
        {kinds.length > 0 &&
          (showIcons ? (
            <ConstraintIcons kinds={kinds} />
          ) : (
            <span className="text-[0.9em] font-semibold">{kinds.map((k) => CONSTRAINTS[k].text).join(' ')}</span>
          ))}
      </span>
      {refTable && (
        <span className="block truncate text-[0.9em] text-muted">
          {t('records.refShort')} {refTable}
        </span>
      )}
      <ColumnResizeHandle column={name} width={width} onResize={onResize} onFit={onFit} />
    </th>
  );
};

export default RecordsViewHeaderCell;
