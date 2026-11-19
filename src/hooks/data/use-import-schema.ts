import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Database } from 'sql.js';
import type { ImportFormat } from '../../domain/import';
import type { DialectId } from '../../domain/types';
import { formatList, getLocale, t, type Locale } from '../../i18n';
import type { ImportReport } from '../../domain/import/to-project';
import { copySqliteRows, isSqliteFile, sqliteToIr, type SqliteExec } from '../../domain/import/sqlite';
import type { Ir } from '../../domain/import/ir';
import { importProjectFrom, importProjectFromIr } from '../../lib/import-project';
import { loadSqlEngine } from '../../lib/sql-engine';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

/** "4 tablas, 2 relaciones y 1 índice" in the interface language. */
export const importSummary = (report: ImportReport) =>
  formatList([
    t('import.tables', { count: report.tables }),
    t('import.relationships', { count: report.relationships }),
    t('import.indexes', { count: report.indexes }),
  ]);

/** State, live preview and submit of the "import DDL, DBML or SQLite" dialog. */
const useImportSchema = () => {
  const open = useUiStore((s) => s.importOpen);
  const addProject = useProjectStore((s) => s.addProject);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [dialect, setDialect] = useState<DialectId | 'auto'>('auto');
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const [namesLocale, setNamesLocale] = useState<Locale | 'auto'>('auto');
  const [sqlite, setSqlite] = useState<{ fileName: string; ir: Ir } | null>(null);
  const [fileState, setFileState] = useState<'idle' | 'loading' | { error: string }>('idle');
  const [copyData, setCopyData] = useState(true);
  const [rowLimit, setRowLimit] = useState(1000);
  const dbRef = useRef<Database | null>(null);
  const deferred = useDeferredValue(text);

  const closeDb = () => {
    dbRef.current?.close();
    dbRef.current = null;
  };
  useEffect(() => closeDb, []);

  const preview = useMemo(() => {
    if (!sqlite && !deferred.trim()) return null;
    try {
      const options = {
        name: name.trim() || fileName,
        namesLocale: namesLocale === 'auto' ? undefined : namesLocale,
        fallbackLocale: getLocale(),
        format: format === 'auto' ? undefined : format,
        dialect: dialect === 'auto' ? undefined : dialect,
      };
      // The IR is cloned because building the project fills in details on it.
      const result = sqlite ? importProjectFromIr(structuredClone(sqlite.ir), 'sqlite', options) : importProjectFrom(deferred, options);
      // With no name typed, the database named in the source, else the default name.
      result.project.name ||= result.project.databaseName || t('projects.defaultName');
      return { result, error: undefined as string | undefined };
    } catch (error) {
      return { result: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [deferred, sqlite, format, dialect, name, fileName, namesLocale]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isSqliteFile(bytes)) {
      setFileState('loading');
      try {
        const SQL = await loadSqlEngine();
        closeDb();
        const db = new SQL.Database(bytes);
        dbRef.current = db;
        setSqlite({ fileName: file.name, ir: sqliteToIr((sql) => db.exec(sql)).ir });
        setText('');
        setFileState('idle');
      } catch (error) {
        closeDb();
        setSqlite(null);
        setFileState({ error: error instanceof Error ? error.message : String(error) });
        return;
      }
    } else {
      removeSqlite();
      setText(new TextDecoder().decode(bytes));
    }
    setFileName(base);
    if (!name.trim()) setName(base);
  };

  const removeSqlite = () => {
    closeDb();
    setSqlite(null);
    setFileState('idle');
  };

  const reset = () => {
    removeSqlite();
    setCopyData(true);
    setRowLimit(1000);
    setText('');
    setName('');
    setFileName('');
    setFormat('auto');
    setDialect('auto');
    setNamesLocale('auto');
  };

  const submit = async () => {
    const result = preview?.result;
    if (!result || result.project.entities.length === 0) return;
    const db = dbRef.current;
    let copied: Awaited<ReturnType<typeof copySqliteRows>> | undefined;
    if (sqlite && db && copyData) {
      const exec: SqliteExec = (sql) => db.exec(sql);
      copied = await copySqliteRows(exec, result.project, Math.max(1, rowLimit));
    }
    await addProject(result.project);
    const ui = useUiStore.getState();
    ui.select(null);
    ui.setView('diagram');
    ui.setImportOpen(false);
    const summary = importSummary(result.report);
    ui.notify(
      copied ? t('import.doneWithRows', { name: result.project.name, summary, rows: copied.rows }) : t('import.done', { name: result.project.name, summary }),
    );
    reset();
  };

  return {
    open,
    text,
    setText,
    format,
    setFormat,
    dialect,
    setDialect,
    name,
    setName,
    namesLocale,
    setNamesLocale,
    preview,
    onFile,
    sqlite,
    fileState,
    removeSqlite,
    copyData,
    setCopyData,
    rowLimit,
    setRowLimit,
    submit,
    close: () => useUiStore.getState().setImportOpen(false),
  };
};

export default useImportSchema;
