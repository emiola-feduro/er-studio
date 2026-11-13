import useQueryBuilder from '../../../hooks/data/use-query-builder';
import useT from '../../../hooks/ui/use-t';
import { downloadText, slug } from '../../../lib/project-file';
import useUiStore from '../../../stores/use-ui-store';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import Button from '../button/button';
import SqlPreviewCode from '../sql-preview/sql-preview-code';
import QueryBuilderColumns from './query-builder-columns';
import QueryBuilderJoins from './query-builder-joins';
import QueryBuilderOptions from './query-builder-options';
import QueryBuilderTables from './query-builder-tables';

/** Builds a SELECT from the chosen tables, joined through their relationships. */
const QueryBuilder = () => {
  const t = useT();
  const builder = useQueryBuilder();
  const { result, spec, clear, projectName } = builder;

  const copy = async () => {
    const { notify } = useUiStore.getState();
    try {
      await navigator.clipboard.writeText(result.sql);
      notify(t('query.copied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-bg md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <div className="relative min-h-0 space-y-5 overflow-y-auto border-r border-line bg-surface p-4">
        <QueryBuilderTables builder={builder} />
        {spec.tableIds.length > 0 && (
          <>
            <QueryBuilderJoins builder={builder} />
            <QueryBuilderColumns builder={builder} />
            <QueryBuilderOptions builder={builder} />
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <h2 className="mr-auto font-semibold">{t('query.title')}</h2>
          <Button size="sm" variant="ghost" onClick={clear} disabled={!spec.tableIds.length}>
            {t('query.clear')}
          </Button>
          <Button size="sm" onClick={() => void copy()} disabled={!result.sql}>
            {t('common.copy')}
          </Button>
          <Button size="sm" variant="primary" disabled={!result.sql} onClick={() => downloadText(`${slug(projectName)}-query.sql`, result.sql, 'application/sql')}>
            {t('query.download')}
          </Button>
          <PanelsRestoreButton />
        </div>
        {result.sql ? <SqlPreviewCode sql={result.sql} /> : <p className="p-6 text-muted">{t('query.empty')}</p>}
      </div>
    </div>
  );
};

export default QueryBuilder;
