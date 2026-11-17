import usePanels from '../../../hooks/ui/use-panels';
import type { PanelMenuState } from '../../../hooks/ui/use-panel-context-menu';
import useT from '../../../hooks/ui/use-t';
import { panelLabel, panelShortcut, type PanelId } from '../../../stores/use-preferences-store';
import ContextMenu from '../../ui/context-menu/context-menu';

type PanelContextMenuProps = {
  menu: PanelMenuState | null;
  onClose: () => void;
};

const SIDEBAR: PanelId[] = ['projects', 'tables', 'relationships'];

/** "Hide this panel" at the pointer, with the shortcut that brings it back. */
const PanelContextMenu = ({ menu, onClose }: PanelContextMenuProps) => {
  const t = useT();
  const { setVisible } = usePanels();
  if (!menu) return null;
  const inSidebar = menu.panels.some((p) => SIDEBAR.includes(p));
  const items = menu.panels.map((id) => ({
    label: t('panels.hideItem', { name: panelLabel(id) }),
    hint: panelShortcut(id),
    onSelect: () => setVisible(id, false),
  }));
  if (inSidebar && menu.panels.length < SIDEBAR.length) {
    items.push({ label: t('panels.hideSidebar'), hint: '', onSelect: () => SIDEBAR.forEach((id) => setVisible(id, false)) });
  }

  return <ContextMenu key={`${menu.x}:${menu.y}`} x={menu.x} y={menu.y} label={t('panels.menuLabel')} items={items} onClose={onClose} />;
};

export default PanelContextMenu;
