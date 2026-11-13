import useT from '../../../hooks/ui/use-t';
import type { Column, DialectId } from '../../../domain/types';
import { columnTypeLabel } from '../../../lib/record-inputs';
import usePreferencesStore from '../../../stores/use-preferences-store';
import ConstraintIcons, { CONSTRAINTS, type ConstraintKind } from '../constraint-icons/constraint-icons';

type RecordsViewHeaderCellProps = {
  column: Column;
  dialect: DialectId;
  refTable?: string;
};

const RecordsViewHeaderCell = ({ column, dialect, refTable }: RecordsViewHeaderCellProps) => {
  const t = useT();
  const { name, pk, origin, nullable, unique, autoIncrement } = column;
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);
  const kinds = [pk && 'pk', origin === 'fk' && 'fk', !nullable && !pk && 'nn', unique && 'uq', autoIncrement && 'ai'].filter(
    Boolean,
  ) as ConstraintKind[];

  return (
    <th scope="col" className="min-w-40 border-b border-l border-line px-2 py-2 text-left align-bottom font-normal">
      <span className={`block font-semibold ${origin === 'fk' ? 'text-fk' : ''}`}>{name}</span>
      <span className="flex items-center gap-1.5 text-[0.92em] text-muted">
        {columnTypeLabel(dialect, column)}
        {kinds.length > 0 &&
          (showIcons ? (
            <ConstraintIcons kinds={kinds} />
          ) : (
            <span className="text-[0.9em] font-semibold">{kinds.map((k) => CONSTRAINTS[k].text).join(' ')}</span>
          ))}
      </span>
      {refTable && <span className="block text-[0.9em] text-muted">{t('records.refShort')} {refTable}</span>}
    </th>
  );
};

export default RecordsViewHeaderCell;
