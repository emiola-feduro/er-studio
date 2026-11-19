import { useEffect, useRef } from 'react';
import type { ConnectionReport } from '../../../lib/connections';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';

type ConnectionDialogReportProps = {
  report: ConnectionReport;
  onTrust: () => void;
};

/** What "Test connection" found: each step that worked, then the result or the error. */
const ConnectionDialogReport = ({ report, onTrust }: ConnectionDialogReportProps) => {
  const t = useT();
  const { steps, serverVersion, error } = report;
  const ref = useRef<HTMLDivElement>(null);

  // The result shows under the form; bring it into view when it arrives.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'end' });
  }, [report]);

  return (
    <div ref={ref} className="space-y-2 border-t border-line pt-4" aria-live="polite" data-testid="connection-report">
      {steps.length > 0 && (
        <ol className="space-y-1">
          {steps.map((step, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="font-medium">{t(`connections.step.${step.kind}`)}</span> <span className="break-all text-muted">{step.target}</span>
              </span>
              <span className="shrink-0 text-muted tabular-nums">{t('connections.ms', { ms: step.ms })}</span>
            </li>
          ))}
        </ol>
      )}
      {serverVersion && !error && <p className="font-medium text-success">{t('connections.connected', { version: serverVersion })}</p>}
      {error && (
        <div role="alert" className="space-y-2">
          {error.code === 'unknownHostKey' && (
            <>
              <p>{t('connections.error.unknownHostKey', { host: error.host })}</p>
              <code className="block font-[inherit] font-sql break-all">{error.fingerprint}</code>
              <Button size="sm" onClick={onTrust}>
                {t('connections.trust')}
              </Button>
            </>
          )}
          {error.code === 'hostKeyChanged' && (
            <>
              <p className="text-danger">{t('connections.error.hostKeyChanged', { host: error.host })}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-sql text-[0.9em]">
                <dt className="text-muted">{t('connections.expected')}</dt>
                <dd className="break-all">{error.expected}</dd>
                <dt className="text-muted">{t('connections.received')}</dt>
                <dd className="break-all">{error.actual}</dd>
              </dl>
              <Button size="sm" variant="danger" onClick={onTrust}>
                {t('connections.trustNew')}
              </Button>
            </>
          )}
          {error.code !== 'unknownHostKey' && error.code !== 'hostKeyChanged' && (
            <p className="text-danger break-words">
              {error.code === 'unreachable' && t('connections.error.unreachable', { target: error.target, message: error.message })}
              {error.code === 'timeout' &&
                t(error.step === 'tcp' ? 'connections.error.timeoutTcp' : 'connections.error.timeout', { target: error.target, seconds: error.seconds })}
              {error.code === 'proxyRefused' && t('connections.error.proxyRefused', { target: error.target, message: error.message })}
              {error.code === 'sshAuthFailed' && t('connections.error.sshAuthFailed', { user: error.user, host: error.host, message: error.message })}
              {error.code === 'invalidKey' && t('connections.error.invalidKey', { message: error.message })}
              {error.code === 'tunnelRefused' && t('connections.error.tunnelRefused', { target: error.target, message: error.message })}
              {error.code === 'tlsConfig' && t('connections.error.tlsConfig', { message: error.message })}
              {error.code === 'database' && t('connections.error.database', { message: error.message })}
              {error.code === 'app' && error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionDialogReport;
