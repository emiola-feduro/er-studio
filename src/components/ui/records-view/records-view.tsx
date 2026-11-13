import useRecordsTable from '../../../hooks/data/use-records-table';
import RecordsViewEmpty from './records-view-empty';
import RecordsViewGrid from './records-view-grid';
import RecordsViewTabs from './records-view-tabs';
import RecordsViewToolbar from './records-view-toolbar';

const RecordsView = () => {
  const data = useRecordsTable();
  const { tables, table, rows } = data;

  if (tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-bg p-8">
        <p className="text-muted">Crea una entidad en el diagrama para empezar a agregar registros.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <RecordsViewTabs data={data} />
      {table && <RecordsViewToolbar data={data} />}
      <div className="relative min-h-0 flex-1 overflow-auto">
        {table && (rows.length === 0 ? <RecordsViewEmpty tableId={table.id} tableName={table.name} /> : <RecordsViewGrid data={data} />)}
      </div>
    </div>
  );
};

export default RecordsView;
