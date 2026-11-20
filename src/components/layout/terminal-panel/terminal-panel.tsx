import { ChevronDown, ChevronUp, X } from 'lucide-react';
import useT from '../../../hooks/ui/use-t';
import usePreferencesStore, { PANEL_WIDTHS } from '../../../stores/use-preferences-store';
import useTerminalStore from '../../../stores/use-terminal-store';
import Button from '../../ui/button/button';
import IconButton from '../../ui/icon-button/icon-button';
import ResizeHandle from '../../ui/resize-handle/resize-handle';
import TerminalNew from './terminal-new';
import TerminalView from './terminal-view';

/** SSH terminals on saved VMs, docked under the workspace with one tab each (desktop only). */
const TerminalPanel = () => {
  const t = useT();
  const tabs = useTerminalStore((s) => s.tabs);
  const active = useTerminalStore((s) => s.active);
  const folded = useTerminalStore((s) => s.folded);
  const choosing = useTerminalStore((s) => s.choosing);
  const { activate, close, setFolded, setChoosing } = useTerminalStore.getState();
  const height = usePreferencesStore((s) => s.panelWidths.terminal ?? PANEL_WIDTHS.terminal.default);

  if (tabs.length === 0 && !choosing) return null;

  return (
    <section aria-label={t('terminal.title')} className="relative flex min-h-0 flex-col border-t border-line bg-surface">
      {!folded && <ResizeHandle panel="terminal" label={t('terminal.resize')} />}
      <div className="flex items-center gap-2 border-b border-line px-2">
        <div role="tablist" aria-label={t('terminal.title')} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`flex shrink-0 items-center rounded-t-[calc(var(--radius)*0.6)] ${tab.key === active && !choosing ? 'bg-surface-2' : ''}`}
            >
              <button
                type="button"
                role="tab"
                id={`terminal-tab-${tab.key}`}
                aria-selected={tab.key === active && !choosing}
                aria-controls={`terminal-panel-${tab.key}`}
                onClick={() => {
                  setChoosing(false);
                  activate(tab.key);
                }}
                className="max-w-56 truncate px-2.5 py-1.5"
              >
                {tab.title}
              </button>
              <IconButton label={t('terminal.close', { name: tab.title })} size="sm" onClick={() => close(tab.key)}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>
          {t('terminal.new')}
        </Button>
        <IconButton label={folded ? t('terminal.unfold') : t('terminal.fold')} size="sm" onClick={() => setFolded(!folded)}>
          {folded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
      </div>
      <div className={folded ? 'hidden' : 'min-h-0'} style={{ height }}>
        {choosing && <TerminalNew />}
        {/* Every tab stays mounted so its session keeps running while another one shows. */}
        {tabs.map((tab) => (
          <TerminalView key={tab.key} tab={tab} visible={!folded && !choosing && tab.key === active} />
        ))}
      </div>
    </section>
  );
};

export default TerminalPanel;
