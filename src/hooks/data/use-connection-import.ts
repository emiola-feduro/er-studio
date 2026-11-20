import { useEffect, useMemo, useRef, useState } from 'react';
import { ENGINE_DIALECT } from '../../domain/connections';
import { copyRows, type CopyReport, type RowSource } from '../../domain/import/copy-rows';
import { sqliteRowSource, sqliteToIr } from '../../domain/import/sqlite';
import { loadSqlEngine } from '../../lib/sql-engine';
import { getLocale, t, type Locale } from '../../i18n';
import { importProjectFromIr } from '../../lib/import-project';
import {
  closeSession,
  listSchemas,
  openSession,
  readSchema,
  sessionErrorMessage,
  sessionRowSource,
  type ConnectionReport,
  type SchemaInfo,
  type SchemaRead,
} from '../../lib/connections';
import useConnectionStore from '../../stores/use-connection-store';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';
import { importSummary } from './use-import-schema';

type Phase = { kind: 'connecting' } | { kind: 'failed'; report: ConnectionReport } | { kind: 'ready' };

/** Opens a saved connection, reads the schemas chosen and creates a project from them, with their rows if asked. */
const useConnectionImport = () => {
  const id = useConnectionStore((s) => s.importFrom);
  const profile = useConnectionStore((s) => s.connections.find((c) => c.id === id));
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [read, setRead] = useState<SchemaRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [name, setName] = useState('');
  const [namesLocale, setNamesLocale] = useState<Locale | 'auto'>('auto');
  const [copyData, setCopyData] = useState(true);
  const [rowLimit, setRowLimit] = useState(1000);
  const [copying, setCopying] = useState<string | null>(null);
  const session = useRef<number | null>(null);
  const sqliteDb = useRef<import('sql.js').Database | null>(null);

  const release = () => {
    if (session.current !== null) void closeSession(session.current);
    session.current = null;
    sqliteDb.current?.close();
    sqliteDb.current = null;
  };

  // Open the session and list the schemas when the dialog opens.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setPhase({ kind: 'connecting' });
    setSchemas([]);
    setSelected([]);
    setRead(null);
    setReadError(null);
    setName(profile.name);
    setNamesLocale('auto');
    setCopyData(true);
    setRowLimit(1000);
    void (async () => {
      if (profile.engine === 'sqlite') {
        // A SQLite file is read here, with the same reader as the web import.
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const SQL = await loadSqlEngine();
          const db = new SQL.Database(await readFile(profile.file ?? ''));
          if (cancelled) return db.close();
          sqliteDb.current?.close();
          sqliteDb.current = db;
          const exec = (sql: string) => db.exec(sql);
          const schema = sqliteToIr(exec);
          setSchemas([{ name: 'main', tables: schema.tables.length }]);
          setSelected(['main']);
          setRead({ ir: schema.ir, sources: [] });
          setPhase({ kind: 'ready' });
        } catch (error) {
          setPhase({ kind: 'failed', report: { steps: [], serverVersion: null, error: { code: 'app', message: sessionErrorMessage(error) } } });
        }
        return;
      }
      const opened = await openSession(profile, profile.id);
      if (cancelled) {
        if (opened.sessionId !== null) void closeSession(opened.sessionId);
        return;
      }
      if (opened.sessionId === null) {
        setPhase({ kind: 'failed', report: opened.report });
        return;
      }
      session.current = opened.sessionId;
      try {
        const found = await listSchemas(opened.sessionId);
        if (cancelled) return;
        setSchemas(found);
        const withTables = found.filter((s) => s.tables > 0);
        // PostgreSQL keeps tables in public; Oracle in the schema of the user who connects.
        const own = profile?.user.trim().toUpperCase();
        const initial = withTables.find((s) => s.name === 'public' || s.name === own) ?? withTables[0];
        setSelected(initial ? [initial.name] : []);
        setPhase({ kind: 'ready' });
      } catch (error) {
        setPhase({ kind: 'failed', report: { steps: opened.report.steps, serverVersion: null, error: { code: 'app', message: sessionErrorMessage(error) } } });
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read the schema again whenever the chosen schemas change.
  useEffect(() => {
    const sessionId = session.current;
    if (phase.kind !== 'ready' || sessionId === null || profile?.engine === 'sqlite') return;
    if (selected.length === 0) {
      setRead(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    setReadError(null);
    readSchema(sessionId, selected)
      .then((result) => !cancelled && setRead(result))
      .catch((error) => !cancelled && setReadError(sessionErrorMessage(error)))
      .finally(() => !cancelled && setReading(false));
    return () => {
      cancelled = true;
    };
  }, [phase.kind, selected]);

  const preview = useMemo(() => {
    if (!read || !profile) return null;
    try {
      // The IR is cloned because building the project fills in details on it.
      const result = importProjectFromIr(structuredClone(read.ir), 'sql', {
        name: name.trim() || profile.name,
        dialect: ENGINE_DIALECT[profile.engine],
        namesLocale: namesLocale === 'auto' ? undefined : namesLocale,
        fallbackLocale: getLocale(),
      });
      return { result, error: undefined as string | undefined };
    } catch (error) {
      return { result: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [read, name, namesLocale, profile]);

  const toggleSchema = (schema: string) => setSelected((list) => (list.includes(schema) ? list.filter((s) => s !== schema) : [...list, schema]));

  const close = () => {
    release();
    useConnectionStore.getState().closeImport();
  };

  const submit = async () => {
    const result = preview?.result;
    const sessionId = session.current;
    const db = sqliteDb.current;
    const source: RowSource | null = db
      ? sqliteRowSource((sql) => db.exec(sql))
      : sessionId !== null && profile
        ? sessionRowSource(sessionId, read?.sources ?? [], profile.engine)
        : null;
    if (!result || !read || !source || result.project.entities.length === 0) return;
    let copied: CopyReport | undefined;
    if (copyData) {
      try {
        copied = await copyRows(source, result.project, Math.max(1, rowLimit), setCopying);
      } catch (error) {
        setCopying(null);
        useUiStore.getState().notify(t('connectionImport.copyFailed', { message: sessionErrorMessage(error) }), 'error');
        return;
      }
      setCopying(null);
    }
    await useProjectStore.getState().addProject(result.project);
    const ui = useUiStore.getState();
    ui.select(null);
    ui.setView('diagram');
    const summary = importSummary(result.report);
    ui.notify(
      copied ? t('import.doneWithRows', { name: result.project.name, summary, rows: copied.rows }) : t('import.done', { name: result.project.name, summary }),
    );
    close();
  };

  return {
    open: Boolean(profile),
    profile,
    phase,
    schemas,
    selected,
    toggleSchema,
    reading,
    readError,
    preview,
    name,
    setName,
    namesLocale,
    setNamesLocale,
    copyData,
    setCopyData,
    rowLimit,
    setRowLimit,
    copying,
    submit: () => void submit(),
    close,
    /** Goes to the connection settings, to fix what the failed attempt reported. */
    editConnection: () => {
      const target = profile?.id;
      close();
      if (target) useConnectionStore.getState().openDialog(target);
    },
  };
};

export default useConnectionImport;
