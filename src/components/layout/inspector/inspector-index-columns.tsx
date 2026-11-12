import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { IndexColumn, Table, TableIndex } from '../../../domain/types';
import { updateIndex } from '../../../lib/actions';
import IconButton from '../../ui/icon-button/icon-button';

type InspectorIndexColumnsProps = {
  entityId: string;
  index: TableIndex;
  table: Table;
};

const InspectorIndexColumns = ({ entityId, index, table }: InspectorIndexColumnsProps) => {
  const { id, columns } = index;
  const setColumns = (next: IndexColumn[]) => updateIndex(entityId, id, { columns: next });
  const available = table.columns.filter((c) => !columns.some((ic) => ic.columnId === c.id));
  const nameOf = (columnId: string) => table.columns.find((c) => c.id === columnId)?.name ?? 'columna eliminada';

  const move = (i: number, delta: -1 | 1) => {
    const next = [...columns];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    setColumns(next);
  };

  return (
    <div className="space-y-1.5">
      <span className="block font-medium">Columnas</span>
      {columns.length === 0 && <p className="text-warning">Elige al menos una columna.</p>}
      <ol className="space-y-1">
        {columns.map((ic, i) => (
          <li key={ic.columnId} className="flex items-center gap-1 rounded-[calc(var(--radius)*0.5)] bg-surface-2 py-0.5 pl-2">
            <span className="w-4 text-muted tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-canvas">{nameOf(ic.columnId)}</span>
            <button
              type="button"
              className="rounded px-1.5 text-[0.86em] font-semibold text-muted hover:bg-surface hover:text-fg"
              aria-label={`Orden ${ic.order === 'ASC' ? 'ascendente' : 'descendente'}, cambiar`}
              onClick={() => setColumns(columns.map((c, j) => (j === i ? { ...c, order: c.order === 'ASC' ? 'DESC' : 'ASC' } : c)))}
            >
              {ic.order}
            </button>
            <IconButton label="Subir columna" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={14} />
            </IconButton>
            <IconButton label="Bajar columna" size="sm" disabled={i === columns.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={14} />
            </IconButton>
            <IconButton label="Quitar columna" size="sm" onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
              <X size={14} />
            </IconButton>
          </li>
        ))}
      </ol>
      {available.length > 0 && (
        <>
          <label htmlFor={`idx-add-${id}`} className="sr-only">
            Añadir columna al índice
          </label>
          <select
            id={`idx-add-${id}`}
            className="field field-sm"
            value=""
            onChange={(e) => e.target.value && setColumns([...columns, { columnId: e.target.value, order: 'ASC' }])}
          >
            <option value="">Añadir columna</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.origin === 'fk' ? ' (FK)' : ''}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};

export default InspectorIndexColumns;
