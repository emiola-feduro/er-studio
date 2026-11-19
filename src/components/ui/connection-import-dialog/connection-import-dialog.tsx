import { LOCALES, type Locale } from '../../../i18n';
import useConnectionImport from '../../../hooks/data/use-connection-import';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';
import ConnectionDialogReport from '../connection-dialog/connection-dialog-report';
import ImportDialogPreview from '../import-dialog/import-dialog-preview';
import Modal from '../modal/modal';

/** New project from a saved connection: choose schemas, preview what comes in, and copy rows if wanted. */
const ConnectionImportDialog = () => {
  const t = useT();
  const dialog = useConnectionImport();
  const { phase, preview } = dialog;
  const result = preview?.result;
  const busy = dialog.copying !== null;
  const canSubmit = phase.kind === 'ready' && !dialog.reading && !busy && !!result && result.project.entities.length > 0;

  return (
    <Modal
      title={t('connectionImport.title', { name: dialog.profile?.name ?? '' })}
      open={dialog.open}
      onClose={dialog.close}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={dialog.close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={dialog.submit}>
            {busy ? t('connectionImport.copying', { table: dialog.copying ?? '' }) : t('connectionImport.submit')}
          </Button>
        </>
      }
    >
      {phase.kind === 'connecting' && <p className="text-muted">{t('connectionImport.connecting')}</p>}
      {phase.kind === 'failed' && (
        <div className="space-y-3">
          <ConnectionDialogReport engine={dialog.profile?.engine} report={phase.report} />
          <Button onClick={dialog.editConnection}>{t('connectionImport.editConnection')}</Button>
        </div>
      )}
      {phase.kind === 'ready' && (
        <div className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 font-medium">{t('connectionImport.schemas')}</legend>
            {dialog.schemas.length === 0 && <p className="text-muted">{t('connectionImport.noSchemas')}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {dialog.schemas.map((schema) => (
                <Checkbox
                  key={schema.name}
                  label={t('connectionImport.schemaOption', { name: schema.name, count: schema.tables })}
                  checked={dialog.selected.includes(schema.name)}
                  onChange={() => dialog.toggleSchema(schema.name)}
                />
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="connection-import-name" className="block font-medium">
                {t('import.name')}
              </label>
              <input id="connection-import-name" className="field" value={dialog.name} onChange={(e) => dialog.setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="connection-import-locale" className="block font-medium">
                {t('import.namesLocale')}
              </label>
              <select
                id="connection-import-locale"
                className="field"
                value={dialog.namesLocale}
                onChange={(e) => dialog.setNamesLocale(e.target.value as Locale | 'auto')}
              >
                <option value="auto">
                  {result && dialog.namesLocale === 'auto'
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Checkbox label={t('import.copyData')} checked={dialog.copyData} onChange={dialog.setCopyData} />
            <div className="flex items-center gap-2">
              <label htmlFor="connection-import-rows" className={dialog.copyData ? '' : 'opacity-50'}>
                {t('import.rowLimit')}
              </label>
              <input
                id="connection-import-rows"
                type="number"
                min={1}
                max={100000}
                className="field w-28"
                value={dialog.rowLimit}
                disabled={!dialog.copyData}
                onChange={(e) => dialog.setRowLimit(Math.min(100000, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
          {dialog.reading && <p className="text-muted">{t('connectionImport.reading')}</p>}
          {dialog.readError && (
            <p role="alert" className="text-danger">
              {t('connectionImport.readFailed', { message: dialog.readError })}
            </p>
          )}
          {!dialog.reading && !dialog.readError && dialog.selected.length > 0 && <ImportDialogPreview preview={preview} />}
        </div>
      )}
    </Modal>
  );
};

export default ConnectionImportDialog;
