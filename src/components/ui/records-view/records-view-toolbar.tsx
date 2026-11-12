import { useState } from 'react';
import type useRecordsTable from '../../../hooks/data/use-records-table';
import useExportRecords from '../../../hooks/data/use-export-records';
import { addRow, clearRows } from '../../../lib/actions';
import Button from '../button/button';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';
import Menu from '../menu/menu';
import Pill from '../pill/pill';
import RecordsViewGenerate from './records-view-generate';

type RecordsData = ReturnType<typeof useRecordsTable>;

const RecordsViewToolbar = ({ data }: { data: RecordsData }) => {
  const { table, rows, cellIssues, totalIssues } = data;
  const { exportRecords, busy } = useExportRecords();
  const [confirming, setConfirming] = useState(false);
  if (!table) return null;
  const tableErrors = [...(cellIssues?.values() ?? [])].reduce((n, cols) => n + cols.size, 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
      <Button variant="primary" size="sm" onClick={() => addRow(table.id)}>
        Añadir registro
      </Button>
      <RecordsViewGenerate tableId={table.id} />
      <span className="text-muted tabular-nums">
        {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
      </span>
      {tableErrors > 0 ? <Pill tone="danger">{tableErrors} con errores</Pill> : rows.length > 0 && <Pill tone="success">Sin errores</Pill>}
      <div className="ml-auto flex items-center gap-2">
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Vaciar tabla
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
              title={totalIssues ? `${totalIssues} errores en total` : undefined}
            >
              {busy ? 'Exportando' : 'Exportar registros'}
            </Button>
          )}
          items={[
            { label: `CSV de ${table.name} (.csv)`, onSelect: () => void exportRecords('csv-table', table.id) },
            { label: 'Todas las tablas a Excel (.xlsx)', onSelect: () => void exportRecords('xlsx'), separatorBefore: true },
            { label: 'Todas las tablas a CSV (.zip)', onSelect: () => void exportRecords('csv-zip') },
            { label: 'Todas las tablas a JSON (.json)', onSelect: () => void exportRecords('json') },
            { label: 'Todas las tablas como INSERT (.sql)', onSelect: () => void exportRecords('sql') },
          ]}
        />
      </div>
      <ConfirmDialog
        open={confirming}
        title="Vaciar tabla"
        message={`Se eliminarán los ${rows.length} registros de "${table.name}". Puedes recuperarlos con Deshacer.`}
        confirmLabel="Vaciar tabla"
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
