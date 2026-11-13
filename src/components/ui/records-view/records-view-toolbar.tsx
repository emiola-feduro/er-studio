import useT from '../../../hooks/ui/use-t';
import { useState } from 'react';
import type useRecordsTable from '../../../hooks/data/use-records-table';
import useExportRecords from '../../../hooks/data/use-export-records';
import { addRow, clearRows } from '../../../lib/actions';
import Button from '../button/button';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import Menu from '../menu/menu';
import Pill from '../pill/pill';
import RecordsViewGenerate from './records-view-generate';

type RecordsData = ReturnType<typeof useRecordsTable>;

const RecordsViewToolbar = ({ data }: { data: RecordsData }) => {
  const t = useT();
  const { table, rows, cellIssues, totalIssues } = data;
  const { exportRecords, busy } = useExportRecords();
  const [confirming, setConfirming] = useState(false);
  if (!table) return null;
  const tableErrors = [...(cellIssues?.values() ?? [])].reduce((n, cols) => n + cols.size, 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
      <Button variant="primary" size="sm" onClick={() => addRow(table.id)}>
        {t('records.addRow')}
      </Button>
      <RecordsViewGenerate tableId={table.id} />
      <span className="text-muted tabular-nums">
        {t('records.rowCount', { count: rows.length })}
      </span>
      {tableErrors > 0 ? <Pill tone="danger">{t('records.withErrors', { count: tableErrors })}</Pill> : rows.length > 0 && <Pill tone="success">{t('records.noErrors')}</Pill>}
      <div className="ml-auto flex items-center gap-2">
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            {t('records.clear')}
          </Button>
        )}
        <Menu
          trigger={({ open, toggle }) => (
            <Button
              size="sm"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
              disabled={busy}
              title={totalIssues ? t('records.totalErrors', { count: totalIssues }) : undefined}
            >
              {busy ? t('records.exporting') : t('records.export')}
            </Button>
          )}
          items={[
            { label: t('records.exportCsvTable', { name: table.name }), onSelect: () => void exportRecords('csv-table', table.id) },
            { label: t('records.exportXlsx'), onSelect: () => void exportRecords('xlsx'), separatorBefore: true },
            { label: t('records.exportCsv'), onSelect: () => void exportRecords('csv-zip') },
            { label: t('records.exportJson'), onSelect: () => void exportRecords('json') },
            { label: t('records.exportSql'), onSelect: () => void exportRecords('sql') },
          ]}
        />
        <PanelsRestoreButton />
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('records.clear')}
        message={t('records.clearMessage', { count: rows.length, name: table.name })}
        confirmLabel={t('records.clear')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          clearRows(table.id);
        }}
      />
    </div>
  );
};

export default RecordsViewToolbar;
