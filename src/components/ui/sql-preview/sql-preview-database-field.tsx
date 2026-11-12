import { setDatabaseName } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const SqlPreviewDatabaseField = () => {
  const databaseName = useProjectStore((s) => s.project?.databaseName ?? '');

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sql-database-name" className="text-muted">
        Base de datos
      </label>
      <input
        id="sql-database-name"
        className="field field-sm w-32 font-sql"
        value={databaseName}
        placeholder="Sin nombre"
        spellCheck={false}
        onChange={(e) => setDatabaseName(e.target.value)}
      />
    </div>
  );
};

export default SqlPreviewDatabaseField;
