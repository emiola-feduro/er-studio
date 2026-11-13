import { useState } from 'react';
import type useModelVersions from '../../../hooks/data/use-model-versions';
import type { ModelVersion } from '../../../domain/types';
import useT from '../../../hooks/ui/use-t';
import usePreferencesStore from '../../../stores/use-preferences-store';
import Button from '../button/button';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';

type Data = ReturnType<typeof useModelVersions>;

const VersionsViewList = ({ data }: { data: Data }) => {
  const t = useT();
  const locale = usePreferencesStore((s) => s.locale);
  const { versions, status, save, remove, restore } = data;
  const [name, setName] = useState('');
  const [pending, setPending] = useState<{ action: 'restore' | 'delete'; version: ModelVersion } | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-4">
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save(name).then(() => setName(''));
        }}
      >
        <label htmlFor="version-name" className="block font-medium">
          {t('versions.name')}
        </label>
        <div className="flex gap-2">
          <input
            id="version-name"
            className="field field-sm min-w-0 flex-1"
            placeholder={t('versions.namePlaceholder', { n: versions.length + 1 })}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" variant="primary">
            {t('versions.save')}
          </Button>
        </div>
      </form>
      {status === 'error' && <p className="text-danger">{t('versions.loadError')}</p>}
      {status === 'ready' && versions.length === 0 && <p className="text-muted">{t('versions.empty')}</p>}
      {status === 'loading' && <div aria-busy="true" className="h-16 animate-pulse rounded-theme bg-surface-2" />}
      <ul className="space-y-2">
        {versions.map((version) => (
          <li key={version.id} className="space-y-1.5 rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium" title={version.name}>
                {version.name}
              </span>
              <span className="shrink-0 text-[0.86em] text-muted tabular-nums">{t('versions.tables', { count: version.snapshot.entities.length })}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <time className="text-[0.86em] text-muted" dateTime={new Date(version.createdAt).toISOString()}>
                {date.format(version.createdAt)}
              </time>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPending({ action: 'restore', version })}>
                  {t('versions.restore')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPending({ action: 'delete', version })}>
                  {t('versions.delete')}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === 'restore' ? t('versions.restoreTitle') : t('versions.deleteTitle')}
        message={pending ? t(pending.action === 'restore' ? 'versions.restoreMessage' : 'versions.deleteMessage', { name: pending.version.name }) : ''}
        confirmLabel={pending?.action === 'restore' ? t('versions.restore') : t('versions.delete')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.action === 'restore') restore(pending.version);
          else void remove(pending.version.id);
          setPending(null);
        }}
      />
    </div>
  );
};

export default VersionsViewList;
