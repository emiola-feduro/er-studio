import { useEffect, useMemo, useState } from 'react';
import { buildOpenApi, openApiJson, openApiYaml } from '../../domain/openapi';
import { t } from '../../i18n';
import { getDerived } from '../../lib/derived';
import { downloadText, slug } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

export type OpenApiFormat = 'json' | 'yaml';

/** Form state and download of the OpenAPI CRUD documentation dialog. */
const useOpenApiExport = () => {
  const project = useProjectStore((s) => s.project);
  const open = useUiStore((s) => s.openApiExportOpen);
  const [format, setFormat] = useState<OpenApiFormat>('json');
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const tables = useMemo(() => (project ? getDerived(project).schema.tables : []), [project]);

  // Every table is selected each time the dialog opens.
  useEffect(() => {
    if (open) setSelected(tables.map((table) => table.id));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string, on: boolean) => setSelected((current) => (on ? [...current, id] : current.filter((x) => x !== id)));
  const selectAll = (on: boolean) => setSelected(on ? tables.map((table) => table.id) : []);

  const download = async () => {
    if (!project || selected.length === 0) return;
    const { notify, setOpenApiExportOpen } = useUiStore.getState();
    setBusy(true);
    try {
      const doc = buildOpenApi(project, getDerived(project).schema, { tableIds: selected, serverUrl });
      const base = `${slug(project.name)}-openapi`;
      if (format === 'yaml') downloadText(`${base}.yaml`, await openApiYaml(doc), 'application/yaml');
      else downloadText(`${base}.json`, openApiJson(doc), 'application/json');
      notify(t('openapi.downloaded'));
      setOpenApiExportOpen(false);
    } catch {
      notify(t('openapi.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return { open, tables, format, setFormat, serverUrl, setServerUrl, selected, toggle, selectAll, busy, download };
};

export default useOpenApiExport;
