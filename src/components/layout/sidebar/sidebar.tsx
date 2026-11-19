import useT from '../../../hooks/ui/use-t';
import { X } from 'lucide-react';
import usePanelContextMenu from '../../../hooks/ui/use-panel-context-menu';
import usePanels from '../../../hooks/ui/use-panels';
import PanelContextMenu from '../panels-menu/panel-context-menu';
import useUiStore from '../../../stores/use-ui-store';
import ProjectList from '../../dynamic/project-list/project-list';
import IconButton from '../../ui/icon-button/icon-button';
import SidebarModelList from './sidebar-model-list';
import SidebarConnections from './sidebar-connections';
import { isDesktop } from '../../../lib/platform';
import ResizeHandle from '../../ui/resize-handle/resize-handle';
import type { PanelId } from '../../../stores/use-preferences-store';

const SIDEBAR_PANELS: PanelId[] = ['projects', 'tables', 'relationships'];

const Sidebar = () => {
  const t = useT();
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const { isVisible } = usePanels();
  const { menu, onContextMenu, close } = usePanelContextMenu();
  const projects = isVisible('projects');
  const model = isVisible('tables') || isVisible('relationships');

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        aria-label={t('sidebar.label')}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-surface lg:relative lg:z-auto lg:flex lg:w-auto ${open ? 'flex' : 'hidden'}`}
        onContextMenu={onContextMenu(SIDEBAR_PANELS.filter(isVisible))}
      >
        <div className="flex justify-end p-2 lg:hidden">
          <IconButton label={t('sidebar.close')} onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
        {projects && <ProjectList expanded={!model} onContextMenu={onContextMenu(['projects'])} />}
        {isDesktop() && <SidebarConnections />}
        {model && (
          <SidebarModelList tables={isVisible('tables')} relationships={isVisible('relationships')} bordered={projects} onContextMenu={onContextMenu} />
        )}
        <ResizeHandle panel="sidebar" label={t('sidebar.resize')} />
        <PanelContextMenu menu={menu} onClose={close} />
      </aside>
    </>
  );
};

export default Sidebar;
