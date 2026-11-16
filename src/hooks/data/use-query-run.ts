import { useState } from 'react';
import { generatedQueryForSqlite, prepareQueryData } from '../../domain/query-data';
import type { QuerySpec } from '../../domain/query-builder';
import { isReadOnlySelect, toSqlite } from '../../domain/sql-translate';
import type { Project } from '../../domain/types';
import { loadSqlEngine, runOnRecords, type QueryRun } from '../../lib/sql-engine';

type RunState = {
  status: 'idle' | 'loading' | 'done';
  run?: QueryRun;
  /** The SQL that SQLite received, after translation. */
  ranSql?: string;
  /** What the run was based on, to tell when the results are out of date. */
  source?: string;
  project?: Project;
};

/** Runs the generated or hand-written query on the project's records, in SQLite in the browser. */
const useQueryRun = (project: Project | null | undefined, spec: QuerySpec, customSql: string | undefined) => {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const source = customSql ?? JSON.stringify(spec);
  const readOnly = customSql === undefined || isReadOnlySelect(customSql);

  const run = async () => {
    if (!project || !readOnly || (customSql === undefined && !spec.tableIds.length)) return;
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const SQL = await loadSqlEngine();
      const data = prepareQueryData(project);
      const sql = customSql !== undefined ? toSqlite(customSql, project.dialect) : generatedQueryForSqlite(data, project, spec);
      setState({ status: 'done', run: runOnRecords(SQL, data, sql), ranSql: sql, source, project });
    } catch (error) {
      setState({ status: 'done', run: { error: error instanceof Error ? error.message : String(error) }, source, project });
    }
  };

  const records = project?.records ?? {};
  const noRecords = customSql === undefined && spec.tableIds.length > 0 && spec.tableIds.every((id) => !records[id]?.length);
  const stale = state.status === 'done' && (state.source !== source || state.project !== project);

  return { ...state, run: state.run, execute: run, reset: () => setState({ status: 'idle' }), stale: stale && !noRecords, readOnly, noRecords };
};

export default useQueryRun;
