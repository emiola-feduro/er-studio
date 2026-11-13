import useT from '../../../hooks/ui/use-t';
import { Dices } from 'lucide-react';
import { canRandomize } from '../../../domain/random-values';
import type { Column, DialectId } from '../../../domain/types';
import { randomizeCell, updateCell } from '../../../lib/actions';
import { cellInputKind, columnMaxLength } from '../../../lib/record-inputs';
import IconButton from '../icon-button/icon-button';
import RecordsViewCellInput from './records-view-cell-input';

type RecordsViewCellProps = {
  tableId: string;
  rowId: string;
  column: Column;
  dialect: DialectId;
  value: string;
  error?: string;
  listId?: string;
};

const RecordsViewCell = ({ tableId, rowId, column, dialect, value, error, listId }: RecordsViewCellProps) => {
  const t = useT();
  const { id: columnId, name } = column;
  const inputId = `cell-${rowId}-${columnId}`;
  const errorId = `${inputId}-error`;
  const limit = columnMaxLength(dialect, column);
  const length = [...value].length;

  return (
    <div className="min-w-36">
      <div className="group flex items-center gap-0.5">
        <RecordsViewCellInput
          id={inputId}
          kind={cellInputKind(dialect, column)}
          column={column}
          dialect={dialect}
          value={value}
          error={error}
          errorId={errorId}
          listId={listId}
          onChange={(next) => updateCell(tableId, rowId, columnId, next)}
        />
        {canRandomize(dialect, column) && (
          <IconButton
            label={t('records.randomValue', { name })}
            size="sm"
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => randomizeCell(tableId, rowId, columnId)}
          >
            <Dices size={14} />
          </IconButton>
        )}
      </div>
      {limit != null && length > 0 && (
        <span className={`block text-right text-[11px] tabular-nums ${length > limit ? 'text-danger' : 'text-muted'}`}>
          {length}/{limit}
        </span>
      )}
      {error && (
        <span id={errorId} className="mt-0.5 block text-[11px] leading-snug text-danger">
          {error}
        </span>
      )}
    </div>
  );
};

export default RecordsViewCell;
