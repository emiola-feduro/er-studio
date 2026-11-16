import useT from '../../../hooks/ui/use-t';
import { useMemo, useRef } from 'react';
import useColumnWidths, { type FitColumn } from '../../../hooks/ui/use-column-widths';
import { CONSTRAINTS } from '../constraint-icons/constraint-icons';
import { cellPlaceholder, columnTypeLabel } from '../../../lib/record-inputs';
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

  const tableRef = useRef<HTMLTableElement>(null);
  const fkTables = useMemo(
    () => new Map((table?.foreignKeys ?? []).flatMap((fk) => fk.columnIds.map((c) => [c, tables.find((x) => x.id === fk.refTableId)?.name ?? '']))),
    [table, tables],
  );
  // Each column fits its widest content (header lines and values) until the person drags its border.
  const fitColumns = useMemo(
    (): FitColumn[] =>
      (table?.columns ?? []).map((column) => {
        const marks = [column.pk && 'pk', column.origin === 'fk' && 'fk', !column.nullable && !column.pk && 'nn', column.unique && 'uq', column.autoIncrement && 'ai']
          .filter(Boolean)
          .map((k) => CONSTRAINTS[k as keyof typeof CONSTRAINTS].text);
        const ref = fkTables.get(column.id);
        // An empty cell shows its placeholder (default value, date format...), so it counts as content.
        const placeholder = cellPlaceholder(dialect, column, t);
        return {
          key: column.id,
          header: [column.name, `${columnTypeLabel(dialect, column)} ${marks.join(' ')}`, ...(ref ? [`${t('records.refShort')} ${ref}`] : [])],
          values: rows.map((row) => row.values[column.id] || placeholder),
        };
      }),
    [table, rows, dialect, fkTables, t],
  );
  const widths = useColumnWidths(`records:${table?.id ?? ''}`, fitColumns, tableRef, { extra: 64, headerExtra: 26, min: 72, max: 480 });

  if (!table) return null;
  const { id: tableId, columns } = table;
  const totalWidth = 48 + 80 + columns.reduce((sum, c) => sum + widths.widthOf(c.id), 0);

  return (
    <>
      {[...suggestions.entries()].map(([columnId, values]) => (
        <datalist key={columnId} id={`dl-${tableId}-${columnId}`}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
      <table ref={tableRef} className="table-fixed border-separate border-spacing-0 font-canvas text-[13px]" style={{ width: totalWidth }}>
        <colgroup>
          <col style={{ width: 48 }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: widths.widthOf(column.id) }} />
          ))}
          <col style={{ width: 80 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th scope="col" className="border-b border-line px-2 py-2 text-right font-medium text-muted">
              #
            </th>
            {columns.map((column) => (
              <RecordsViewHeaderCell
                key={column.id}
                column={column}
                dialect={dialect}
                refTable={fkTables.get(column.id)}
                width={widths.widthOf(column.id)}
                onResize={(width) => widths.resize(column.id, width)}
                onFit={() => widths.fit(column.id)}
              />
            ))}
            <th scope="col" className="border-b border-line">
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
