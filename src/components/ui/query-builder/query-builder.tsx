import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import usePanelContextMenu from '../../../hooks/ui/use-panel-context-menu';
import usePanels from '../../../hooks/ui/use-panels';
import usePreferencesStore, { PANEL_WIDTHS } from '../../../stores/use-preferences-store';
import PanelContextMenu from '../../layout/panels-menu/panel-context-menu';
import ResizeHandle from '../resize-handle/resize-handle';
import useQueryBuilder from '../../../hooks/data/use-query-builder';
import useEditorCompletion from '../../../hooks/data/use-editor-completion';
import useDerived from '../../../hooks/data/use-derived';
import useQueryRunner from '../../../hooks/data/use-query-runner';
import LiveWriteDialog from './live-write-dialog';
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
  const runner = useQueryRunner(project, spec, customSql, result.sql, tab);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const { isVisible } = usePanels();
  const { menu, onContextMenu, close } = usePanelContextMenu();
  const builderWidth = usePreferencesStore((s) => s.panelWidths.queryBuilder ?? PANEL_WIDTHS.queryBuilder.default);
  const resultsHeight = usePreferencesStore((s) => s.panelWidths.queryResults ?? PANEL_WIDTHS.queryResults.default);
  const showBuilder = isVisible('queryBuilder');
  const showResults = isVisible('queryResults');
  const complete = useEditorCompletion(useDerived()?.schema, project?.dialect);
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
    <div
      className="grid h-full min-h-0 grid-cols-1 bg-bg md:grid-cols-(--query-cols)"
      style={{ '--query-cols': showBuilder ? `${builderWidth}px minmax(0,1fr)` : 'minmax(0,1fr)' } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      {showBuilder && (
        <div className="relative flex min-h-0 flex-col border-r border-line bg-surface" onContextMenu={onContextMenu(['queryBuilder'])}>
          {/* The handle stays outside the scrolling area so it covers the whole edge. */}
          <div className="relative min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <QueryBuilderTables builder={builder} />
            {spec.tableIds.length > 0 && (
              <>
                <QueryBuilderJoins builder={builder} />
                <QueryBuilderColumns builder={builder} />
                <QueryBuilderOptions builder={builder} />
              </>
            )}
          </div>
          <ResizeHandle panel="queryBuilder" label={t('panels.resizeQueryBuilder')} />
        </div>
      )}
      <div className="flex min-h-0 flex-col">
        <QueryBuilderToolbar builder={builder} runner={runner} sql={sql} onCopyToEditor={() => copyToEditor()} />
        <div className="relative flex min-h-28 flex-1 flex-col overflow-auto">
          {tab === 'editor' ? (
            <SqlEditor
              id="query-editor"
              label={t('query.sqlLabel')}
              value={customSql}
              onChange={setCustomSql}
              placeholder={t('query.editorPlaceholder')}
              complete={complete}
            />
          ) : result.sql ? (
            <SqlPreviewCode sql={result.sql} />
          ) : (
            <p className="p-6 text-muted">{t('query.empty')}</p>
          )}
        </div>
        {project && showResults && (
          // Never taller than the column minus room for the query above, so the query never disappears.
          <div
            className="relative flex min-h-0 shrink-0 flex-col"
            style={{ height: `min(${resultsHeight}px, calc(100% - 9rem))` }}
            onContextMenu={onContextMenu(['queryResults'])}
          >
            <ResizeHandle panel="queryResults" label={t('panels.resizeQueryResults')} />
            <QueryBuilderResults
              runner={runner}
              key={runner.connection?.id ?? 'records'}
              dialect={project.dialect}
              scope={`results:${project.id}`}
              sourceLabel={runner.from ? t(runner.from === 'editor' ? 'query.fromEditor' : 'query.fromGenerated') : undefined}
            />
          </div>
        )}
      </div>
      <PanelContextMenu menu={menu} onClose={close} />
      {runner.live && runner.connection && (
        <LiveWriteDialog request={runner.live.request} connection={runner.connection} onConfirm={runner.live.confirmWrite} onCancel={runner.live.cancelWrite} />
      )}
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
