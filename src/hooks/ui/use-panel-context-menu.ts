import { useCallback, useState, type MouseEvent } from 'react';
import type { PanelId } from '../../stores/use-preferences-store';

export type PanelMenuState = { x: number; y: number; panels: PanelId[] };

/**
 * Right click on a panel opens a menu to hide it. Text fields keep the browser's own menu (copy,
 * paste), and the innermost panel wins over the one around it.
 */
const usePanelContextMenu = () => {
  const [menu, setMenu] = useState<PanelMenuState | null>(null);

  const onContextMenu = useCallback(
    (panels: PanelId[]) => (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, panels });
    },
    [],
  );

  return { menu, onContextMenu, close: useCallback(() => setMenu(null), []) };
};

export default usePanelContextMenu;
