import { useState } from 'react';
import type { ConnectionProfile } from '../../../domain/connections';
import type useLiveCompare from '../../../hooks/data/use-live-compare';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import Modal from '../modal/modal';

type VersionsViewLiveProps = {
  connection: ConnectionProfile;
  live: ReturnType<typeof useLiveCompare>;
};

/** The live side of a comparison: which schema is read, its state, and applying the migration to it. */
const VersionsViewLive = ({ connection, live }: VersionsViewLiveProps) => {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const { status, migration } = live;
  const changes = migration?.changes.length ?? 0;
  const blocked = !connection.allowWrites ? t('liveCompare.readOnly') : live.dialectMismatch ? t('liveCompare.mismatch') : null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
      {live.schemas.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('liveCompare.schema')}</span>
          <select
            className="field field-sm w-40"
            value={live.schema}
            onChange={(e) => live.chooseSchema(e.target.value)}
            disabled={status === 'reading' || status === 'applying'}
          >
            {live.schemas.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {status === 'reading' && <span className="text-muted">{t('liveCompare.reading', { name: connection.name })}</span>}
      {status === 'applying' && <span className="text-muted">{t('liveCompare.applying')}</span>}
      {status === 'failed' && live.error && (
        <span role="alert" className="text-danger">
          {live.error}
        </span>
      )}
      <span className="mr-auto" />
      <Button size="sm" variant="ghost" disabled={status === 'reading' || status === 'applying'} onClick={live.reread}>
        {t('liveCompare.reread')}
      </Button>
      {blocked && changes > 0 && <span className="text-muted">{blocked}</span>}
      <Button size="sm" variant="primary" disabled={!migration || changes === 0 || Boolean(blocked) || status !== 'ready'} onClick={() => setConfirming(true)}>
        {t('liveCompare.apply')}
      </Button>
      <Modal
        title={t('liveCompare.confirmTitle')}
        open={confirming}
        onClose={() => setConfirming(false)}
        width="max-w-lg"
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={typed.trim() !== connection.name}
              onClick={() => {
                setConfirming(false);
                setTyped('');
                void live.apply();
              }}
            >
              {t('liveCompare.apply')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>{t('liveCompare.confirmMessage', { count: changes, name: connection.name })}</p>
          <p className={connection.engine === 'mysql' ? 'text-warning' : ''}>
            {connection.engine === 'mysql' ? t('liveCompare.mysqlNote') : t('liveCompare.transactionNote')}
          </p>
          <div className="space-y-1">
            <label htmlFor="live-compare-confirm" className="block">
              {t('live.typeToConfirm', { name: connection.name })}
            </label>
            <input id="live-compare-confirm" className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VersionsViewLive;
