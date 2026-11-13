import { ChevronsUp, Menu as MenuIcon, Redo2, Undo2 } from 'lucide-react';
import usePanels from '../../../hooks/ui/use-panels';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';
import IconButton from '../../ui/icon-button/icon-button';
import SegmentedControl from '../../ui/segmented-control/segmented-control';
import PanelsMenu from '../panels-menu/panels-menu';
import TopBarDialectSelect from './top-bar-dialect-select';
import TopBarExportMenu from './top-bar-export-menu';
import TopBarProjectName from './top-bar-project-name';

const TopBar = () => {
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const { sidebar, setVisible } = usePanels();

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2">
      {sidebar && (
        <IconButton label="Mostrar proyectos" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
          <MenuIcon size={18} />
        </IconButton>
      )}
      <span className="font-bold tracking-tight">ER Studio</span>
      <span className="h-5 w-px bg-line" aria-hidden />
      <TopBarProjectName />
      <div className="mx-auto">
        <SegmentedControl
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: 'diagram', label: 'Diagrama' },
            { value: 'sql', label: 'SQL' },
            { value: 'records', label: 'Registros' },
          ]}
        />
      </div>
      <TopBarDialectSelect />
      <div className="flex items-center">
        <IconButton label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Rehacer (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} />
        </IconButton>
      </div>
      <TopBarExportMenu />
      <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
        Apariencia
      </Button>
      <PanelsMenu
        trigger={({ open, toggle }) => (
          <Button size="sm" variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            Paneles
          </Button>
        )}
      />
      <IconButton label="Ocultar encabezado (Alt+5)" onClick={() => setVisible('header', false)}>
        <ChevronsUp size={18} />
      </IconButton>
    </header>
  );
};

export default TopBar;
