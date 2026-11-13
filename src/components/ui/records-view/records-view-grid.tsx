import useT from '../../../hooks/ui/use-t';
import { useMemo } from 'react';
import type useRecordsTable from '../../../hooks/data/use-records-table';
import RecordsViewHeaderCell from './records-view-header-cell';
import RecordsViewRow from './records-view-row';

type RecordsData = ReturnType<typeof useRecordsTable>;

const RecordsViewGrid = ({ data }: { data: RecordsData }) => {
  const t = useT();
  const { table, rows, tables, allRecords, dialect, cellIssues } = data;

  /** Values available in the referenced tables, offered as suggestions for FK cells. */
  const suggestions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const fk of table?.foreignKeys ?? []) {
      const refRows = allRecords[fk.refTableId] ?? [];
      fk.columnIds.forEach((columnId, i) => {
        const refColumnId = fk.refColumnIds[i];
        const values = refRows.map((r) => r.values[refColumnId]).filter((v): v is string => Boolean(v?.trim()));
        map.set(columnId, [...new Set(values)]);
      });
    }
    return map;
  }, [table, allRecords]);

  if (!table) return null;
  const { id: tableId, columns } = table;
  const fkTables = new Map((table.foreignKeys ?? []).flatMap((fk) => fk.columnIds.map((c) => [c, tables.find((t) => t.id === fk.refTableId)?.name ?? ''])));

  return (
    <>
      {[...suggestions.entries()].map(([columnId, values]) => (
        <datalist key={columnId} id={`dl-${tableId}-${columnId}`}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
      <table className="min-w-full border-separate border-spacing-0 font-canvas text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th scope="col" className="w-12 border-b border-line px-2 py-2 text-right font-medium text-muted">
              #
            </th>
            {columns.map((column) => (
              <RecordsViewHeaderCell key={column.id} column={column} dialect={dialect} refTable={fkTables.get(column.id)} />
            ))}
            <th scope="col" className="w-20 border-b border-line">
              <span className="sr-only">{t('records.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <RecordsViewRow
              key={row.id}
              tableId={tableId}
              row={row}
              index={index}
              columns={columns}
              dialect={dialect}
              errors={cellIssues?.get(row.id)}
              hasSuggestions={(columnId) => suggestions.has(columnId)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
};

export default RecordsViewGrid;
