import useT from '../../../hooks/ui/use-t';
import { X } from 'lucide-react';
import usePanels from '../../../hooks/ui/use-panels';
import useUiStore from '../../../stores/use-ui-store';
import ProjectList from '../../dynamic/project-list/project-list';
import IconButton from '../../ui/icon-button/icon-button';
import SidebarModelList from './sidebar-model-list';
import ResizeHandle from '../../ui/resize-handle/resize-handle';

const Sidebar = () => {
  const t = useT();
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const { isVisible } = usePanels();
  const projects = isVisible('projects');
  const model = isVisible('tables') || isVisible('relationships');

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        aria-label={t('sidebar.label')}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-surface lg:relative lg:z-auto lg:flex lg:w-auto ${open ? 'flex' : 'hidden'}`}
      >
        <div className="flex justify-end p-2 lg:hidden">
          <IconButton label={t('sidebar.close')} onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
        {projects && <ProjectList expanded={!model} />}
        {model && <SidebarModelList tables={isVisible('tables')} relationships={isVisible('relationships')} bordered={projects} />}
        <ResizeHandle panel="sidebar" label={t('sidebar.resize')} />
      </aside>
    </>
  );
};

export default Sidebar;
