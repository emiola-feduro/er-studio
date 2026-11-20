import useTerminalSession from '../../../hooks/data/use-terminal-session';
import useT from '../../../hooks/ui/use-t';
import type { TerminalTab } from '../../../stores/use-terminal-store';
import Button from '../../ui/button/button';
import ConnectionDialogReport from '../../ui/connection-dialog/connection-dialog-report';

type TerminalViewProps = { tab: TerminalTab; visible: boolean };

/** One terminal: the screen, and what happened when it could not connect or the session ended. */
const TerminalView = ({ tab, visible }: TerminalViewProps) => {
  const t = useT();
  const { ref, status, reconnect, trust } = useTerminalSession(tab, visible);

  return (
    <div
      role="tabpanel"
      id={`terminal-panel-${tab.key}`}
      aria-labelledby={`terminal-tab-${tab.key}`}
      className={`relative h-full min-h-0 flex-col ${visible ? 'flex' : 'hidden'}`}
    >
      {status.kind === 'connecting' && <p className="px-3 pt-2 text-muted">{t('terminal.connecting', { name: tab.title })}</p>}
      {status.kind === 'failed' && (
        <div className="space-y-2 overflow-y-auto px-3 py-2">
          <ConnectionDialogReport report={status.report} onTrust={trust} />
          <Button size="sm" onClick={reconnect}>
            {t('terminal.retry')}
          </Button>
        </div>
      )}
      {status.kind === 'ended' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="text-muted">{status.code === null ? t('terminal.ended') : t('terminal.endedCode', { code: status.code })}</span>
          <Button size="sm" onClick={reconnect}>
            {t('terminal.reconnect')}
          </Button>
        </div>
      )}
      <div
        ref={ref}
        className={`min-h-0 flex-1 px-2 py-1 ${status.kind === 'failed' ? 'hidden' : ''}`}
        aria-label={t('terminal.screen', { name: tab.title })}
      />
    </div>
  );
};

export default TerminalView;
