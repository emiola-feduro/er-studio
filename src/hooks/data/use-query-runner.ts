import type { ConnectionProfile } from '../../domain/connections';
import type { QuerySpec } from '../../domain/query-builder';
import type { Project } from '../../domain/types';
import { isDesktop } from '../../lib/platform';
import useConnectionStore from '../../stores/use-connection-store';
import useQueryStore, { type QueryTab } from '../../stores/use-query-store';
import useLiveQuery from './use-live-query';
import useQueryRun from './use-query-run';

/**
 * The query runner of the Queries view: on the project's records (SQLite in the browser), or on a saved
 * connection chosen for this project (desktop).
 */
const useQueryRunner = (project: Project | null | undefined, spec: QuerySpec, editorSql: string, generatedSql: string, tab: QueryTab) => {
  const local = useQueryRun(project, spec, editorSql, tab);
  const targetId = useQueryStore((s) => (project ? s.targets[project.id] : undefined));
  const connections = useConnectionStore((s) => s.connections);
  const connection: ConnectionProfile | undefined = isDesktop() && targetId ? connections.find((c) => c.id === targetId) : undefined;
  const live = useLiveQuery(connection);
  const sql = tab === 'editor' ? editorSql : generatedSql;

  if (!connection) return { ...local, connection: undefined, live: undefined };
  return {
    status: live.status,
    run: live.run,
    ranSql: live.ranSql,
    from: live.from,
    ready: Boolean(sql.trim()) && !live.pending,
    stale: false,
    noRecords: false,
    readOnly: true,
    execute: async () => live.start(sql, tab),
    reset: live.reset,
    connection,
    live,
  };
};

export default useQueryRunner;
