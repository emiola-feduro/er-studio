import { ChevronRight, Pencil } from 'lucide-react';
import IconButton from '../../ui/icon-button/icon-button';
import type { ConnectionEnvironment } from '../../../domain/connections';
import useT from '../../../hooks/ui/use-t';
import useConnectionStore from '../../../stores/use-connection-store';
import usePreferencesStore from '../../../stores/use-preferences-store';
import Button from '../../ui/button/button';
import Pill from '../../ui/pill/pill';

const ENV_TONE: Record<ConnectionEnvironment, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  local: 'neutral',
  development: 'accent',
  staging: 'warning',
  production: 'danger',
};

/** Saved database connections (desktop only); folds to its title like the project list. */
const SidebarConnections = () => {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);
  const openDialog = useConnectionStore((s) => s.openDialog);
  const openImport = useConnectionStore((s) => s.openImport);
  const collapsed = usePreferencesStore((s) => Boolean(s.collapsedSections.connections));
  const setCollapsed = usePreferencesStore((s) => s.setSectionCollapsed);

  return (
    <section className="flex max-h-[35%] min-h-0 flex-col border-t border-line px-2 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2 pr-2 pb-1.5 pl-1">
        <h2 className="min-w-0">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="connection-list-body"
            title={t('sidebar.toggleSection', { name: t('connections.title') })}
            onClick={() => setCollapsed('connections', !collapsed)}
            className="flex min-w-0 items-center gap-1 rounded-[calc(var(--radius)*0.5)] px-1 py-0.5 font-semibold hover:bg-surface-2"
          >
            <ChevronRight size={15} aria-hidden className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            <span>{t('connections.title')}</span>
            <span className="text-[0.85em] font-normal text-muted tabular-nums">{connections.length}</span>
          </button>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => openDialog()}>
          {t('connections.new')}
        </Button>
      </div>
      {!collapsed && (
        <ul id="connection-list-body" className="relative min-h-0 overflow-y-auto">
          {connections.length === 0 && <li className="px-2 text-muted">{t('connections.empty')}</li>}
          {connections.map((connection) => (
            <li key={connection.id} className="group flex items-center gap-1">
              <button
                type="button"
                title={t('connections.createProject')}
                onClick={() => openImport(connection.id)}
                className="flex min-w-0 flex-1 flex-col items-start rounded-[calc(var(--radius)*0.6)] px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                  <span className="truncate">{connection.name}</span>
                  <Pill tone={ENV_TONE[connection.environment]}>{t(`connections.env.${connection.environment}`)}</Pill>
                </span>
                <span className="w-full truncate text-[0.85em] text-muted">
                  {connection.hops.length > 0
                    ? t('connections.viaHops', { target: `${connection.host}/${connection.database}`, count: connection.hops.length })
                    : `${connection.host}/${connection.database}`}
                </span>
              </button>
              <IconButton label={t('connections.edit', { name: connection.name })} size="sm" onClick={() => openDialog(connection.id)}>
                <Pencil size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default SidebarConnections;
