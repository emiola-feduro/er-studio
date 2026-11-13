import useT from '../../../hooks/ui/use-t';
import { useDdl } from '../../../hooks/data/use-derived';
import { downloadText, slug } from '../../../lib/project-file';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import SqlPreviewCode from './sql-preview-code';
import SqlPreviewDatabaseField from './sql-preview-database-field';
import SqlPreviewFontSelect from './sql-preview-font-select';

const SqlPreview = () => {
  const t = useT();
  const ddl = useDdl();
  const projectName = useProjectStore((s) => s.project?.name ?? 'proyecto');
  const notify = useUiStore((s) => s.notify);
  if (!ddl) return null;
  const { sql, warnings } = ddl;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      notify(t('sql.copied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="sr-only">{t('sql.title')}</h2>
        <SqlPreviewDatabaseField />
        <SqlPreviewFontSelect />
        <span className="flex-1" />
        <Button size="sm" onClick={copy}>
          {t('common.copy')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => downloadText(`${slug(projectName)}.sql`, sql, 'application/sql')}>
          {t('sql.download')}
        </Button>
        <PanelsRestoreButton />
      </div>
      {warnings.length > 0 && (
        <ul className="space-y-1 border-b border-line bg-warning-soft px-4 py-2 text-warning">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <SqlPreviewCode sql={sql} />
    </div>
  );
};

export default SqlPreview;
