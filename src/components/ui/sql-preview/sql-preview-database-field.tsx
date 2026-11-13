import useT from '../../../hooks/ui/use-t';
import { setDatabaseName } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const SqlPreviewDatabaseField = () => {
  const t = useT();
  const databaseName = useProjectStore((s) => s.project?.databaseName ?? '');

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sql-database-name" className="text-muted">
        {t('sql.database')}
      </label>
      <input
        id="sql-database-name"
        className="field field-sm w-32 font-sql"
        value={databaseName}
        placeholder={t('common.untitled')}
        spellCheck={false}
        onChange={(e) => setDatabaseName(e.target.value)}
      />
    </div>
  );
};

export default SqlPreviewDatabaseField;
