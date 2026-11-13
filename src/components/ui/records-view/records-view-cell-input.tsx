import useT from '../../../hooks/ui/use-t';
import type { Column, DialectId } from '../../../domain/types';
import { cellPlaceholder, type CellInputKind } from '../../../lib/record-inputs';

type RecordsViewCellInputProps = {
  id: string;
  kind: CellInputKind;
  column: Column;
  dialect: DialectId;
  value: string;
  error?: string;
  errorId: string;
  listId?: string;
  onChange: (value: string) => void;
};

/** The control that fits the column type: a list for ENUM and booleans, a typed input for the rest. */
const RecordsViewCellInput = ({ id, kind, column, dialect, value, error, errorId, listId, onChange }: RecordsViewCellInputProps) => {
  const t = useT();
  const { name, nullable, enumValues = [] } = column;
  const common = {
    id,
    'aria-label': name,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    className: `field field-sm ${error ? 'border-danger! bg-danger-soft' : ''}`,
  };

  if (kind === 'enum' || kind === 'bool') {
    const options = kind === 'enum' ? enumValues : ['true', 'false'];
    const current = kind === 'bool' ? value.toLowerCase() : value;
    return (
      <select {...common} value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">{nullable ? 'NULL' : t('records.pickValue')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {current && !options.includes(current) && <option value={current}>{t('records.notAllowed', { value })}</option>}
      </select>
    );
  }

  const numeric = kind === 'integer' || kind === 'decimal';
  return (
    <input
      {...common}
      type={kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text'}
      step={kind === 'time' ? 1 : undefined}
      inputMode={kind === 'integer' ? 'numeric' : kind === 'decimal' ? 'decimal' : undefined}
      list={listId}
      placeholder={cellPlaceholder(dialect, column, t)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${common.className} ${numeric ? 'text-right tabular-nums' : ''}`}
    />
  );
};

export default RecordsViewCellInput;
