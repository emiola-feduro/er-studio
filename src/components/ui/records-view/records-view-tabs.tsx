import type useRecordsTable from '../../../hooks/data/use-records-table';

type RecordsData = ReturnType<typeof useRecordsTable>;

const RecordsViewTabs = ({ data }: { data: RecordsData }) => {
  const { tables, table: current, allRecords, countByTable, selectTable } = data;

  return (
    <div role="tablist" aria-label="Tablas" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 pt-2">
      {tables.map(({ id, name, kind }) => {
        const active = current?.id === id;
        const rows = allRecords[id]?.length ?? 0;
        const errors = countByTable?.get(id) ?? 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => selectTable(id)}
            className={`-mb-px flex shrink-0 items-center gap-2 rounded-t-[calc(var(--radius)*0.75)] border-(length:--bw) px-3 py-2 ${active ? 'border-line border-b-surface bg-surface font-semibold' : 'border-transparent text-muted hover:text-fg'}`}
          >
            <span className={kind === 'junction' ? 'italic' : ''}>{name || 'sin nombre'}</span>
            <span className="text-[0.85em] text-muted tabular-nums">{rows}</span>
            {errors > 0 && (
              <span className="rounded-full bg-danger-soft px-1.5 text-[0.8em] font-semibold text-danger" title={`${errors} errores`}>
                {errors}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default RecordsViewTabs;
