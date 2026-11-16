import { useState } from 'react';
import { generatedQueryForSqlite, prepareQueryData } from '../../domain/query-data';
import type { QuerySpec } from '../../domain/query-builder';
import { isReadOnlySelect, toSqlite } from '../../domain/sql-translate';
import type { Project } from '../../domain/types';
import { loadSqlEngine, runOnRecords, type QueryRun } from '../../lib/sql-engine';
import type { QueryTab } from '../../stores/use-query-store';

type RunState = {
  status: 'idle' | 'loading' | 'done';
  run?: QueryRun;
  /** The SQL that SQLite received, after translation. */
  ranSql?: string;
  /** Which tab the run came from, and what it was based on, to tell when it is out of date. */
  from?: QueryTab;
  source?: string;
  project?: Project;
};

/** Runs the generated query or the editor's SQL on the project's records, in SQLite in the browser. */
const useQueryRun = (project: Project | null | undefined, spec: QuerySpec, editorSql: string, tab: QueryTab) => {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const sourceOf = (from: QueryTab) => (from === 'editor' ? editorSql : JSON.stringify(spec));
  const readOnly = tab === 'generated' || !editorSql.trim() || isReadOnlySelect(editorSql);
  const ready = tab === 'generated' ? spec.tableIds.length > 0 : Boolean(editorSql.trim()) && isReadOnlySelect(editorSql);

  const execute = async () => {
    if (!project || !ready) return;
    const from = tab;
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const SQL = await loadSqlEngine();
      const data = prepareQueryData(project);
      const sql = from === 'editor' ? toSqlite(editorSql, project.dialect) : generatedQueryForSqlite(data, project, spec);
      setState({ status: 'done', run: runOnRecords(SQL, data, sql), ranSql: sql, from, source: sourceOf(from), project });
    } catch (error) {
      setState({ status: 'done', run: { error: error instanceof Error ? error.message : String(error) }, from, source: sourceOf(from), project });
    }
  };

  const records = project?.records ?? {};
  const noRecords = tab === 'generated' && spec.tableIds.length > 0 && spec.tableIds.every((id) => !records[id]?.length);
  const stale = state.status === 'done' && !!state.from && (state.source !== sourceOf(state.from) || state.project !== project);

  return { ...state, execute, reset: () => setState({ status: 'idle' }), ready, stale: stale && !noRecords, readOnly, noRecords };
};

export default useQueryRun;
