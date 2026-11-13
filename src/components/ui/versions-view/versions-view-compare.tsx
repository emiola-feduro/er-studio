import type { MessageKey } from '../../../i18n';
import type useModelVersions from '../../../hooks/data/use-model-versions';
import { CURRENT } from '../../../hooks/data/use-model-versions';
import useT from '../../../hooks/ui/use-t';
import { downloadText, slug } from '../../../lib/project-file';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Pill from '../pill/pill';
import SqlPreviewCode from '../sql-preview/sql-preview-code';

type Data = ReturnType<typeof useModelVersions>;

/** Chooses two versions and shows what changed and the migration script. */
const VersionsViewCompare = ({ data }: { data: Data }) => {
  const t = useT();
  const { versions, fromId, setFromId, toId, setToId, migration, projectName } = data;

  const copy = async () => {
    if (!migration) return;
    const { notify } = useUiStore.getState();
    try {
      await navigator.clipboard.writeText(migration.sql);
      notify(t('versions.copied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-2">
        <h2 className="mr-auto self-center font-semibold">{t('versions.compare')}</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="version-from" className="text-muted">
            {t('versions.from')}
          </label>
          <select id="version-from" className="field field-sm w-44" value={fromId} onChange={(e) => setFromId(e.target.value)} disabled={!versions.length}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="version-to" className="text-muted">
            {t('versions.to')}
          </label>
          <select id="version-to" className="field field-sm w-44" value={toId} onChange={(e) => setToId(e.target.value)} disabled={!versions.length}>
            <option value={CURRENT}>{t('versions.current')}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => void copy()} disabled={!migration}>
          {t('common.copy')}
        </Button>
        <Button size="sm" variant="primary" disabled={!migration} onClick={() => migration && downloadText(`${slug(projectName)}-migration.sql`, migration.sql, 'application/sql')}>
          {t('versions.download')}
        </Button>
      </div>
      {migration ? (
        <>
          <div className="max-h-[40%] space-y-2 overflow-y-auto border-b border-line px-4 py-3">
            <h3 className="font-semibold">{t('versions.changes', { count: migration.changes.length })}</h3>
            {migration.changes.length === 0 && <p className="text-muted">{t('versions.noChanges')}</p>}
            <ul className="space-y-1">
              {migration.changes.map((change, i) => (
                <li key={`${change.kind}-${change.table}-${change.detail}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 font-medium">{t(`migration.kind.${change.kind}` as MessageKey)}</span>
                  <span className="min-w-0 font-canvas text-[0.92em] break-all">
                    {change.table}
                    {change.detail ? `: ${change.detail}` : ''}
                  </span>
                  {change.destructive && <Pill tone="danger">{t('versions.destructive')}</Pill>}
                </li>
              ))}
            </ul>
            {migration.warnings.length > 0 && (
              <ul className="space-y-1 rounded-[calc(var(--radius)*0.75)] bg-warning-soft px-3 py-2 text-warning">
                {migration.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
          <SqlPreviewCode sql={migration.sql} />
        </>
      ) : (
        <p className="p-6 text-muted">{t('versions.empty')}</p>
      )}
    </div>
  );
};

export default VersionsViewCompare;
