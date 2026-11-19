import { useRef } from 'react';
import { DIALECT_LIST, DIALECTS } from '../../../domain/dialects';
import type { ImportFormat } from '../../../domain/import';
import type { DialectId } from '../../../domain/types';
import { LOCALES, type Locale } from '../../../i18n';
import useImportSchema from '../../../hooks/data/use-import-schema';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';
import Modal from '../modal/modal';
import ImportDialogPreview from './import-dialog-preview';

/** Reverse engineering: paste or upload a DDL or DBML, or open a SQLite file, and get a new project with its diagram. */
const ImportDialog = () => {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    open,
    close,
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
    sqlite,
    fileState,
    removeSqlite,
    copyData,
    setCopyData,
    rowLimit,
    setRowLimit,
  } = useImportSchema();
  const result = preview?.result;
  const canSubmit = !!result && result.project.entities.length > 0;

  return (
    <Modal
      title={t('import.title')}
      open={open}
      onClose={close}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {t('import.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={sqlite ? undefined : 'import-source'} className="font-medium">
              {sqlite ? t('import.sqliteFile') : t('import.source')}
            </label>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              {t('import.file')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".sql,.dbml,.ddl,.txt,.sqlite,.sqlite3,.db,.db3"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void onFile(e)}
            />
          </div>
          {sqlite ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-theme border-(length:--bw) border-line bg-surface-2 px-3 py-2.5">
              <span data-testid="import-sqlite-file" className="min-w-0 truncate font-medium">
                {sqlite.fileName}
              </span>
              <Button size="sm" variant="ghost" onClick={removeSqlite}>
                {t('import.removeFile')}
              </Button>
            </div>
          ) : (
            <textarea
              id="import-source"
              className="field h-56 resize-y font-sql text-[0.92em] leading-relaxed"
              value={text}
              spellCheck={false}
              placeholder={t('import.placeholder')}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          )}
          {fileState === 'loading' && <p className="text-muted">{t('import.sqliteLoading')}</p>}
          {typeof fileState === 'object' && (
            <p role="alert" className="text-danger">
              {t('import.sqliteFailed', { message: fileState.error })}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="import-format" className="block font-medium">
              {t('import.format')}
            </label>
            {sqlite ? (
              <select id="import-format" className="field" value="sqlite" disabled>
                <option value="sqlite">SQLite</option>
              </select>
            ) : (
              <select id="import-format" className="field" value={format} onChange={(e) => setFormat(e.target.value as ImportFormat | 'auto')}>
                <option value="auto">
                  {result && format === 'auto' ? t('import.detected', { name: result.format === 'dbml' ? 'DBML' : 'SQL' }) : t('import.auto')}
                </option>
                <option value="sql">SQL</option>
                <option value="dbml">DBML</option>
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="import-dialect" className="block font-medium">
              {t('import.dialect')}
            </label>
            <select id="import-dialect" className="field" value={dialect} onChange={(e) => setDialect(e.target.value as DialectId | 'auto')}>
              <option value="auto">{result && dialect === 'auto' ? t('import.detected', { name: DIALECTS[result.dialect].name }) : t('import.auto')}</option>
              {DIALECT_LIST.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="import-name" className="block font-medium">
              {t('import.name')}
            </label>
            <input id="import-name" className="field" value={name} placeholder={result?.project.name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="import-names-locale" className="block font-medium">
              {t('import.namesLocale')}
            </label>
            <select id="import-names-locale" className="field" value={namesLocale} onChange={(e) => setNamesLocale(e.target.value as Locale | 'auto')}>
              <option value="auto">
                {result && namesLocale === 'auto'
                  ? t('import.detected', { name: LOCALES.find((l) => l.id === result.project.namesLocale)?.name ?? '' })
                  : t('import.auto')}
              </option>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {sqlite && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Checkbox label={t('import.copyData')} checked={copyData} onChange={setCopyData} />
            <div className="flex items-center gap-2">
              <label htmlFor="import-row-limit" className={copyData ? '' : 'opacity-50'}>
                {t('import.rowLimit')}
              </label>
              <input
                id="import-row-limit"
                type="number"
                min={1}
                max={100000}
                className="field w-28"
                value={rowLimit}
                disabled={!copyData}
                onChange={(e) => setRowLimit(Math.min(100000, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
        )}
        <ImportDialogPreview preview={preview} />
      </div>
    </Modal>
  );
};

export default ImportDialog;
