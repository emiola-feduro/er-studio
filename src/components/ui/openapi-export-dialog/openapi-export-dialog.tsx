import useOpenApiExport, { type OpenApiFormat } from '../../../hooks/data/use-openapi-export';
import useT from '../../../hooks/ui/use-t';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';

/** Downloads a CRUD API description in OpenAPI 3.1 for the chosen tables. */
const OpenApiExportDialog = () => {
  const t = useT();
  const setOpen = useUiStore((s) => s.setOpenApiExportOpen);
  const { open, tables, format, setFormat, serverUrl, setServerUrl, selected, toggle, selectAll, busy, download } = useOpenApiExport();

  return (
    <Modal
      title={t('openapi.dialogTitle')}
      open={open}
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={selected.length === 0 || busy} onClick={() => void download()}>
            {t('openapi.download')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="block font-medium">{t('openapi.format')}</span>
          <SegmentedControl<OpenApiFormat>
            label={t('openapi.format')}
            value={format}
            onChange={setFormat}
            options={[
              { value: 'json', label: 'JSON' },
              { value: 'yaml', label: 'YAML' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="openapi-server" className="block font-medium">
            {t('openapi.serverUrl')}
          </label>
          <input id="openapi-server" className="field font-canvas" value={serverUrl} spellCheck={false} onChange={(e) => setServerUrl(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <legend className="font-medium">{t('openapi.tables')}</legend>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => selectAll(true)}>
                {t('openapi.selectAll')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => selectAll(false)}>
                {t('openapi.selectNone')}
              </Button>
            </div>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto sm:grid-cols-2">
            {tables.map((table) => (
              <Checkbox key={table.id} label={table.name} checked={selected.includes(table.id)} onChange={(on) => toggle(table.id, on)} />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
};

export default OpenApiExportDialog;
