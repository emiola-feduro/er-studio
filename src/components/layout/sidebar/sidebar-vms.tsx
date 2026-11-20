import { ChevronRight, Pencil } from 'lucide-react';
import { vmLabel } from '../../../domain/ssh-hosts';
import useT from '../../../hooks/ui/use-t';
import useConnectionStore from '../../../stores/use-connection-store';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useTerminalStore from '../../../stores/use-terminal-store';
import Button from '../../ui/button/button';
import IconButton from '../../ui/icon-button/icon-button';

/** Saved VMs (desktop only): click one to open a terminal on it; they also serve as steps of a connection's route. */
const SidebarVms = () => {
  const t = useT();
  const hosts = useConnectionStore((s) => s.sshHosts);
  const openHostDialog = useConnectionStore((s) => s.openHostDialog);
  const openTerminal = useTerminalStore((s) => s.open);
  const collapsed = usePreferencesStore((s) => Boolean(s.collapsedSections.vms));
  const setCollapsed = usePreferencesStore((s) => s.setSectionCollapsed);

  return (
    <section className="flex max-h-[30%] min-h-0 flex-col border-t border-line px-2 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2 pr-2 pb-1.5 pl-1">
        <h2 className="min-w-0">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="vm-list-body"
            title={t('sidebar.toggleSection', { name: t('vms.title') })}
            onClick={() => setCollapsed('vms', !collapsed)}
            className="flex min-w-0 items-center gap-1 rounded-[calc(var(--radius)*0.5)] px-1 py-0.5 font-semibold hover:bg-surface-2"
          >
            <ChevronRight size={15} aria-hidden className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            <span>{t('vms.title')}</span>
            <span className="text-[0.85em] font-normal text-muted tabular-nums">{hosts.length}</span>
          </button>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => openHostDialog()}>
          {t('connections.new')}
        </Button>
      </div>
      {!collapsed && (
        <ul id="vm-list-body" className="relative min-h-0 overflow-y-auto">
          {hosts.length === 0 && <li className="px-2 text-muted">{t('vms.empty')}</li>}
          {hosts.map((host) => (
            <li key={host.id} className="flex items-center gap-1">
              <button
                type="button"
                title={t('vms.openTerminal')}
                onClick={() => openTerminal({ hostId: host.id, title: host.name, shell: host.shell, customShell: host.customShell })}
                className="flex min-w-0 flex-1 flex-col items-start rounded-[calc(var(--radius)*0.6)] px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="w-full truncate">{host.name}</span>
                <span className="w-full truncate text-[0.85em] text-muted">
                  {host.user}@{vmLabel(host)}
                </span>
              </button>
              <IconButton label={t('vms.editNamed', { name: host.name })} size="sm" onClick={() => openHostDialog(host.id)}>
                <Pencil size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default SidebarVms;
