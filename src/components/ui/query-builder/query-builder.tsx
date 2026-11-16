import type { KeyboardEvent } from 'react';
import useQueryBuilder from '../../../hooks/data/use-query-builder';
import useQueryRun from '../../../hooks/data/use-query-run';
import useT from '../../../hooks/ui/use-t';
import { downloadText, slug } from '../../../lib/project-file';
import useUiStore from '../../../stores/use-ui-store';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import Button from '../button/button';
import SqlPreviewCode from '../sql-preview/sql-preview-code';
import QueryBuilderColumns from './query-builder-columns';
import QueryBuilderJoins from './query-builder-joins';
import QueryBuilderOptions from './query-builder-options';
import QueryBuilderResults from './query-builder-results';
import QueryBuilderTables from './query-builder-tables';

/** Builds a SELECT from the chosen tables, joined through their relationships. */
const QueryBuilder = () => {
  const t = useT();
  const builder = useQueryBuilder();
  const { result, spec, clear, projectName, project, customSql, setCustomSql } = builder;
  const runner = useQueryRun(project, spec, customSql);
  const editing = customSql !== undefined;
  const sql = editing ? customSql : result.sql;
  const canRun = runner.readOnly && Boolean(sql.trim()) && runner.status !== 'loading';

  // Ctrl+Enter (Cmd+Enter on a Mac) runs the query from anywhere in the view.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (canRun) void runner.execute();
    }
  };

  const copy = async () => {
    const { notify } = useUiStore.getState();
    try {
      await navigator.clipboard.writeText(sql);
      notify(t('query.copied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-bg md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]" onKeyDown={onKeyDown}>
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
          {editing ? (
            <Button size="sm" variant="ghost" onClick={() => setCustomSql(undefined)}>
              {t('query.useGenerated')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={!result.sql} onClick={() => setCustomSql(result.sql)}>
              {t('query.editSql')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clear();
              runner.reset();
            }}
            disabled={!spec.tableIds.length && !editing}
          >
            {t('query.clear')}
          </Button>
          <Button size="sm" onClick={() => void copy()} disabled={!sql}>
            {t('common.copy')}
          </Button>
          <Button size="sm" disabled={!sql} onClick={() => downloadText(`${slug(projectName)}-query.sql`, sql, 'application/sql')}>
            {t('query.download')}
          </Button>
          <Button size="sm" variant="primary" title={t('query.runTitle')} disabled={!canRun} onClick={() => void runner.execute()}>
            {t('query.run')}
          </Button>
          <PanelsRestoreButton />
        </div>
        <div className="relative max-h-[45%] min-h-28 shrink-0 overflow-auto">
          {editing ? (
            <textarea
              aria-label={t('query.sqlLabel')}
              className="block h-full min-h-56 w-full resize-y border-0 bg-bg p-4 font-sql text-[0.92em] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              value={customSql}
              spellCheck={false}
              onChange={(e) => setCustomSql(e.target.value)}
            />
          ) : result.sql ? (
            <SqlPreviewCode sql={result.sql} />
          ) : (
            <p className="p-6 text-muted">{t('query.empty')}</p>
          )}
        </div>
        {(editing || spec.tableIds.length > 0) && project && <QueryBuilderResults runner={runner} dialect={project.dialect} />}
      </div>
    </div>
  );
};

export default QueryBuilder;
