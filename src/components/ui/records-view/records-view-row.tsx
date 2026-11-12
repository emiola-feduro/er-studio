import { Copy, Trash2 } from 'lucide-react';
import type { Column, DataRow, DialectId } from '../../../domain/types';
import { deleteRow, duplicateRow } from '../../../lib/actions';
import IconButton from '../icon-button/icon-button';
import RecordsViewCell from './records-view-cell';

type RecordsViewRowProps = {
  tableId: string;
  row: DataRow;
  index: number;
  columns: Column[];
  dialect: DialectId;
  errors?: Map<string, string>;
  hasSuggestions: (columnId: string) => boolean;
};

const RecordsViewRow = ({ tableId, row, index, columns, dialect, errors, hasSuggestions }: RecordsViewRowProps) => {
  const { id, values } = row;

  return (
    <tr className={errors ? 'bg-danger-soft/40' : 'hover:bg-surface-2/60'}>
      <th scope="row" className="border-b border-line px-2 py-1 text-right align-top font-normal text-muted tabular-nums">
        <span className="inline-block pt-1.5">{index + 1}</span>
      </th>
      {columns.map((column) => (
        <td key={column.id} className="border-b border-l border-line p-1 align-top">
          <RecordsViewCell
            tableId={tableId}
            rowId={id}
            column={column}
            dialect={dialect}
            value={values[column.id] ?? ''}
            error={errors?.get(column.id)}
            listId={hasSuggestions(column.id) ? `dl-${tableId}-${column.id}` : undefined}
          />
        </td>
      ))}
      <td className="border-b border-line px-1 align-top">
        <div className="flex">
          <IconButton label={`Duplicar registro ${index + 1}`} size="sm" onClick={() => duplicateRow(tableId, id)}>
            <Copy size={14} />
          </IconButton>
          <IconButton label={`Eliminar registro ${index + 1}`} tone="danger" size="sm" onClick={() => deleteRow(tableId, id)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
};

export default RecordsViewRow;
