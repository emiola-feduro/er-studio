import { useState, type KeyboardEvent } from 'react';
import useQueryBuilder from '../../../hooks/data/use-query-builder';
import useQueryRun from '../../../hooks/data/use-query-run';
import useT from '../../../hooks/ui/use-t';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';
import SqlEditor from '../sql-editor/sql-editor';
import SqlPreviewCode from '../sql-preview/sql-preview-code';
import QueryBuilderColumns from './query-builder-columns';
import QueryBuilderJoins from './query-builder-joins';
import QueryBuilderOptions from './query-builder-options';
import QueryBuilderResults from './query-builder-results';
import QueryBuilderTables from './query-builder-tables';
import QueryBuilderToolbar from './query-builder-toolbar';

/**
 * Builds a SELECT from the chosen tables, joined through their relationships, next to an editor for
 * SQL written by hand. Either one runs on the project's records.
 */
const QueryBuilder = () => {
  const t = useT();
  const builder = useQueryBuilder();
  const { result, spec, project, customSql, setCustomSql, tab, setTab } = builder;
  const runner = useQueryRun(project, spec, customSql, tab);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const sql = tab === 'editor' ? customSql : result.sql;

  // Ctrl+Enter (Cmd+Enter on a Mac) runs the open tab's query from anywhere in the view.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (runner.ready && runner.status !== 'loading') void runner.execute();
    }
  };

  const copyToEditor = (replace = false) => {
    if (customSql.trim() && !replace) {
      setConfirmReplace(true);
      return;
    }
    setCustomSql(result.sql);
    setTab('editor');
    setConfirmReplace(false);
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
        <QueryBuilderToolbar builder={builder} runner={runner} sql={sql} onCopyToEditor={() => copyToEditor()} />
        <div className="relative flex max-h-[45%] min-h-28 shrink-0 flex-col overflow-auto">
          {tab === 'editor' ? (
            <SqlEditor id="query-editor" label={t('query.sqlLabel')} value={customSql} onChange={setCustomSql} placeholder={t('query.editorPlaceholder')} />
          ) : result.sql ? (
            <SqlPreviewCode sql={result.sql} />
          ) : (
            <p className="p-6 text-muted">{t('query.empty')}</p>
          )}
        </div>
        {project && (
          <QueryBuilderResults
            runner={runner}
            dialect={project.dialect}
            scope={`results:${project.id}`}
            sourceLabel={runner.from ? t(runner.from === 'editor' ? 'query.fromEditor' : 'query.fromGenerated') : undefined}
          />
        )}
      </div>
      <ConfirmDialog
        open={confirmReplace}
        title={t('query.replaceTitle')}
        message={t('query.replaceMessage')}
        confirmLabel={t('query.replace')}
        onConfirm={() => copyToEditor(true)}
        onCancel={() => setConfirmReplace(false)}
      />
    </div>
  );
};

export default QueryBuilder;
