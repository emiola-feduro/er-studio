import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSchema } from '../../domain/inference';
import { diffSchemas } from '../../domain/migration';
import { uid } from '../../domain/model';
import type { ModelVersion } from '../../domain/types';
import { DIALECTS } from '../../domain/dialects';
import { t } from '../../i18n';
import { deleteVersion, listVersions, saveVersion } from '../../lib/db';
import { restoreVersion } from '../../lib/actions';
import useProjectStore from '../../stores/use-project-store';
import usePreferencesStore from '../../stores/use-preferences-store';
import useUiStore from '../../stores/use-ui-store';

/** Value of the "to" selector that stands for the model as it is now. */
export const CURRENT = 'current';

/** Saved versions of the open project and the migration between two of them. */
const useModelVersions = () => {
  const project = useProjectStore((s) => s.project);
  const locale = usePreferencesStore((s) => s.locale);
  const projectId = project?.id;
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState(CURRENT);

  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await listVersions(projectId);
      setVersions(list);
      setStatus('ready');
      setFromId((current) => (list.some((v) => v.id === current) ? current : (list[0]?.id ?? '')));
    } catch {
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    setStatus('loading');
    setToId(CURRENT);
    void reload();
  }, [reload]);

  const save = async (name: string) => {
    if (!project) return;
    const { records: _records, ...snapshot } = structuredClone(project);
    void _records;
    const label = name.trim() || t('versions.namePlaceholder', { n: versions.length + 1 });
    await saveVersion({ id: uid(), projectId: project.id, name: label, createdAt: Date.now(), snapshot });
    useUiStore.getState().notify(t('versions.saved', { name: label }));
    await reload();
  };

  const remove = async (id: string) => {
    await deleteVersion(id);
    await reload();
  };

  const restore = (version: ModelVersion) => {
    restoreVersion(version.snapshot);
    useUiStore.getState().notify(t('versions.restored', { name: version.name }));
  };

  const migration = useMemo(() => {
    if (!project) return null;
    const from = versions.find((v) => v.id === fromId);
    const to = toId === CURRENT ? project : versions.find((v) => v.id === toId)?.snapshot;
    if (!from || !to) return null;
    const toLabel = toId === CURRENT ? t('versions.current') : versions.find((v) => v.id === toId)!.name;
    const result = diffSchemas(buildSchema(from.snapshot as typeof project), buildSchema(to as typeof project), to.dialect, { from: from.name, to: toLabel });
    if (from.snapshot.dialect !== to.dialect) {
      result.warnings.unshift(t('migration.dialectMismatch', { from: DIALECTS[from.snapshot.dialect].name, to: DIALECTS[to.dialect].name }));
    }
    return result;
    // The language is a dependency because the SQL comments and warnings are translated.
  }, [project, versions, fromId, toId, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return { versions, status, reload, save, remove, restore, fromId, setFromId, toId, setToId, migration, projectName: project?.name ?? '' };
};

export default useModelVersions;
