import { useEffect, useRef, useState } from 'react';
import type { ConnectionProfile } from '../../domain/connections';
import { statementInfo, type StatementInfo } from '../../domain/sql-statement';
import { t } from '../../i18n';
import { closeSession, finishLive, openSession, runLive, sessionErrorCode, sessionErrorMessage, type ConnectionReport } from '../../lib/connections';
import type { QueryRun } from '../../lib/sql-engine';
import type { QueryTab } from '../../stores/use-query-store';
import useUiStore from '../../stores/use-ui-store';

/** Rows kept from a live query; the rest are counted as cut. */
export const LIVE_MAX_ROWS = 1000;
/** Matches the desktop side: a change nobody decides on is undone after two minutes. */
const PENDING_MS = 120_000;

export type PendingWrite = { rowsAffected: number | null; deadline: number };
export type WriteRequest = { sql: string; info: StatementInfo; from: QueryTab };

const ERROR_KEYS = {
  writesDisabled: 'live.writesDisabled',
  notReadOnly: 'live.notReadOnly',
  pendingWrite: 'live.pendingWrite',
  nothingPending: 'live.nothingPending',
  sessionClosed: 'connections.error.sessionClosed',
} as const;

const errorText = (error: unknown) => {
  const code = sessionErrorCode(error);
  return code && code in ERROR_KEYS ? t(ERROR_KEYS[code as keyof typeof ERROR_KEYS]) : sessionErrorMessage(error);
};

const reportText = (report: ConnectionReport) => {
  const error = report.error;
  if (!error) return '';
  return 'message' in error ? error.message : t('live.connectFailed');
};

/**
 * Runs the query on a saved connection (desktop). Reads run right away and are always rolled back; a
 * write asks first, then waits for the person to confirm or undo it.
 */
const useLiveQuery = (connection: ConnectionProfile | undefined) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [run, setRun] = useState<QueryRun | undefined>();
  const [ranSql, setRanSql] = useState<string | undefined>();
  const [from, setFrom] = useState<QueryTab | undefined>();
  const [truncated, setTruncated] = useState(false);
  const [rowsAffected, setRowsAffected] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [request, setRequest] = useState<WriteRequest | null>(null);
  const session = useRef<{ connectionId: string; id: number } | null>(null);

  const close = () => {
    if (session.current) void closeSession(session.current.id);
    session.current = null;
  };

  // A new connection starts from a clean state; leaving closes the session (which undoes a pending change).
  useEffect(() => {
    setStatus('idle');
    setRun(undefined);
    setPending(null);
    setRequest(null);
    return close;
  }, [connection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionId = async (): Promise<number> => {
    if (!connection) throw new Error(t('live.connectFailed'));
    if (session.current?.connectionId === connection.id) return session.current.id;
    close();
    const opened = await openSession(connection, connection.id);
    if (opened.sessionId === null) throw new Error(reportText(opened.report));
    session.current = { connectionId: connection.id, id: opened.sessionId };
    return opened.sessionId;
  };

  const show = (sql: string, tab: QueryTab, result: QueryRun, affected: number | null = null, cut = false) => {
    setRanSql(sql);
    setFrom(tab);
    setRun(result);
    setRowsAffected(affected);
    setTruncated(cut);
    setStatus('done');
  };

  const execute = async (sql: string, tab: QueryTab, write = false) => {
    setStatus('loading');
    const attempt = async () => runLive(await sessionId(), sql, write, LIVE_MAX_ROWS);
    try {
      let result;
      try {
        result = await attempt();
      } catch (error) {
        // The session closes on a timeout or when the app restarts: open a new one once, for reads.
        if (sessionErrorCode(error) !== 'sessionClosed' || write) throw error;
        session.current = null;
        result = await attempt();
      }
      show(sql, tab, { columns: result.columns, rows: result.rows, ms: result.ms }, result.rowsAffected, result.truncated);
      if (result.pending) setPending({ rowsAffected: result.rowsAffected, deadline: Date.now() + PENDING_MS });
    } catch (error) {
      show(sql, tab, { error: errorText(error) });
    }
  };

  /** Reads run now; anything else asks first, or says the connection does not allow it. */
  const start = (sql: string, tab: QueryTab) => {
    const info = statementInfo(sql, connection?.engine);
    if (info.multiple) return show(sql, tab, { error: t('live.oneStatement') });
    if (info.readOnly) return void execute(sql, tab);
    if (!connection?.allowWrites) return show(sql, tab, { error: t('live.writesDisabled') });
    setRequest({ sql, info, from: tab });
  };

  const confirmWrite = () => {
    if (!request) return;
    setRequest(null);
    void execute(request.sql, request.from, true);
  };

  const finish = async (commit: boolean) => {
    const current = session.current;
    setPending(null);
    if (!current) return;
    try {
      await finishLive(current.id, commit);
      useUiStore.getState().notify(t(commit ? 'live.committed' : 'live.undone'));
      return true;
    } catch (error) {
      show(ranSql ?? '', from ?? 'editor', { error: errorText(error) });
      return false;
    }
  };

  // Clear the banner when the desktop side undoes the change on its own.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), Math.max(0, pending.deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);

  return {
    status,
    run,
    ranSql,
    from,
    truncated,
    rowsAffected,
    pending,
    request,
    start,
    confirmWrite,
    cancelWrite: () => setRequest(null),
    finish,
    reset: () => {
      setStatus('idle');
      setRun(undefined);
    },
  };
};

export default useLiveQuery;
