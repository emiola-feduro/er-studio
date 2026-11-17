import { ChevronRight } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import useT from '../../../hooks/ui/use-t';
import usePreferencesStore, { type ModelSection } from '../../../stores/use-preferences-store';
import useProjectStore from '../../../stores/use-project-store';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';

type SidebarModelSectionProps = {
  title: string;
  panel: ModelSection;
  count: number;
  onContextMenu: (event: MouseEvent) => void;
  children: ReactNode;
};

/** A sidebar list that folds to its title, like a dropdown; each project remembers its own fold. */
const SidebarModelSection = ({ title, panel, count, onContextMenu, children }: SidebarModelSectionProps) => {
  const t = useT();
  const projectId = useProjectStore((s) => s.project?.id ?? '');
  const collapsed = usePreferencesStore((s) => Boolean(s.collapsedByProject[projectId]?.[panel]));
  const setCollapsed = (value: boolean) => usePreferencesStore.getState().setModelSectionCollapsed(projectId, panel, value);
  const listId = `sidebar-section-${panel}`;

  return (
    <section className="mb-4 last:mb-0" onContextMenu={onContextMenu}>
      <div className="flex items-center justify-between pr-1 pb-1 pl-1">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={listId}
          title={t('sidebar.toggleSection', { name: title })}
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-w-0 items-center gap-1 rounded-[calc(var(--radius)*0.5)] px-1 py-0.5 font-semibold hover:bg-surface-2"
        >
          <ChevronRight size={15} aria-hidden className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span className="truncate">{title}</span>
          <span className="text-[0.85em] font-normal text-muted tabular-nums">{count}</span>
        </button>
        <PanelHideButton panel={panel} />
      </div>
      {!collapsed && (
        <div id={listId}>{count === 0 ? <p className="px-2 pb-2 text-muted">{t('common.none')}</p> : <ul>{children}</ul>}</div>
      )}
    </section>
  );
};

export default SidebarModelSection;
