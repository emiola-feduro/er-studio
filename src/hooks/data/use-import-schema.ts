import { useDeferredValue, useMemo, useState, type ChangeEvent } from 'react';
import type { ImportFormat } from '../../domain/import';
import type { DialectId } from '../../domain/types';
import { formatList, getLocale, t, type Locale } from '../../i18n';
import type { ImportReport } from '../../domain/import/to-project';
import { importProjectFrom } from '../../lib/import-project';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

/** "4 tablas, 2 relaciones y 1 índice" in the interface language. */
export const importSummary = (report: ImportReport) =>
  formatList([
    t('import.tables', { count: report.tables }),
    t('import.relationships', { count: report.relationships }),
    t('import.indexes', { count: report.indexes }),
  ]);

/** State, live preview and submit of the "import DDL or DBML" dialog. */
const useImportSchema = () => {
  const open = useUiStore((s) => s.importOpen);
  const addProject = useProjectStore((s) => s.addProject);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [dialect, setDialect] = useState<DialectId | 'auto'>('auto');
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const [namesLocale, setNamesLocale] = useState<Locale | 'auto'>('auto');
  const deferred = useDeferredValue(text);

  const preview = useMemo(() => {
    if (!deferred.trim()) return null;
    try {
      const result = importProjectFrom(deferred, {
        name: name.trim() || fileName,
        namesLocale: namesLocale === 'auto' ? undefined : namesLocale,
        fallbackLocale: getLocale(),
        format: format === 'auto' ? undefined : format,
        dialect: dialect === 'auto' ? undefined : dialect,
      });
      // With no name typed, the database named in the source, else the default name.
      result.project.name ||= result.project.databaseName || t('projects.defaultName');
      return { result, error: undefined as string | undefined };
    } catch (error) {
      return { result: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [deferred, format, dialect, name, fileName, namesLocale]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setText(await file.text());
    const base = file.name.replace(/\.[^.]+$/, '');
    setFileName(base);
    if (!name.trim()) setName(base);
  };

  const reset = () => {
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
    await addProject(result.project);
    const ui = useUiStore.getState();
    ui.select(null);
    ui.setView('diagram');
    ui.setImportOpen(false);
    ui.notify(t('import.done', { name: result.project.name, summary: importSummary(result.report) }));
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
    submit,
    close: () => useUiStore.getState().setImportOpen(false),
  };
};

export default useImportSchema;
