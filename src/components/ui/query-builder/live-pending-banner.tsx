import { useEffect, useState } from 'react';
import type { PendingWrite } from '../../../hooks/data/use-live-query';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';

type LivePendingBannerProps = {
  pending: PendingWrite;
  onFinish: (commit: boolean) => void;
};

/** A change that ran in a transaction and waits: confirm keeps it, undo throws it away, and time undoes it. */
const LivePendingBanner = ({ pending, onFinish }: LivePendingBannerProps) => {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round((pending.deadline - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <div role="status" className="mx-4 mb-2 flex flex-wrap items-center gap-3 rounded-theme border-(length:--bw) border-warning bg-warning-soft px-3 py-2">
      <span className="min-w-56 flex-1">
        {pending.rowsAffected !== null ? t('live.pending', { count: pending.rowsAffected }) : t('live.pendingUnknown')} {t('live.undoIn', { time: clock })}
      </span>
      <Button size="sm" onClick={() => onFinish(false)}>
        {t('live.undo')}
      </Button>
      <Button size="sm" variant="primary" onClick={() => onFinish(true)}>
        {t('live.commit')}
      </Button>
    </div>
  );
};

export default LivePendingBanner;
