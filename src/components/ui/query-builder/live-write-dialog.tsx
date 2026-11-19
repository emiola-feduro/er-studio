import { useEffect, useState } from 'react';
import type { ConnectionProfile } from '../../../domain/connections';
import type { WriteRequest } from '../../../hooks/data/use-live-query';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import Modal from '../modal/modal';
import Pill from '../pill/pill';

type LiveWriteDialogProps = {
  request: WriteRequest | null;
  connection: ConnectionProfile;
  onConfirm: () => void;
  onCancel: () => void;
};

const ENV_TONE = { local: 'neutral', development: 'accent', staging: 'warning', production: 'danger' } as const;

/**
 * Asks before a statement that changes the database runs. It runs inside a transaction that waits for a
 * second decision; a statement that touches a whole table, and any change in production, also asks to
 * type a name.
 */
const LiveWriteDialog = ({ request, connection, onConfirm, onCancel }: LiveWriteDialogProps) => {
  const t = useT();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [request]);
  if (!request) return null;
  const { risk } = request.info;
  const production = connection.environment === 'production';
  // What has to be typed: the table or object at risk, else the connection name in production.
  const expected = risk?.target || (production ? connection.name : '');
  const ok = !expected || typed.trim() === expected;

  return (
    <Modal
      title={t('live.confirmTitle')}
      open
      onClose={onCancel}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ok} onClick={onConfirm}>
            {t('live.runAndReview')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{connection.name}</span>
          <Pill tone={ENV_TONE[connection.environment]}>{t(`connections.env.${connection.environment}`)}</Pill>
        </p>
        <pre className="max-h-48 overflow-auto rounded-theme border-(length:--bw) border-line bg-surface-2 p-3 font-sql text-[0.9em] whitespace-pre-wrap">
          <code className="font-[inherit]">{request.sql}</code>
        </pre>
        <p>{t('live.reviewNote')}</p>
        {risk && (
          <p role="alert" className="text-danger">
            {risk.kind === 'noWhere' && t(risk.verb === 'DELETE' ? 'live.risk.deleteAll' : 'live.risk.updateAll', { target: risk.target })}
            {risk.kind === 'drop' && t('live.risk.drop', { object: risk.object, target: risk.target })}
            {risk.kind === 'truncate' && t('live.risk.truncate', { target: risk.target })}
            {risk.kind === 'alter' && t('live.risk.alter', { target: risk.target })}
          </p>
        )}
        {expected && (
          <div className="space-y-1">
            <label htmlFor="live-write-confirm" className="block">
              {t('live.typeToConfirm', { name: expected })}
            </label>
            <input id="live-write-confirm" className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default LiveWriteDialog;
