import { useEffect } from 'react';
import { addEntity, deleteSelection } from '../../lib/actions';
import useProjectStore from '../../stores/use-project-store';
import usePreferencesStore, { PANELS } from '../../stores/use-preferences-store';
import useUiStore from '../../stores/use-ui-store';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

/** Global shortcuts: undo, redo, delete selection, new entity, panels (Alt+1 to Alt+5), diagram only (F), Escape. */
const useKeyboardShortcuts = () => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const typing = isTyping(event.target);
      const { undo, redo } = useProjectStore.getState();

      if (mod && key === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y' && !typing) {
        event.preventDefault();
        redo();
        return;
      }
      // Alt+1 to Alt+5 toggle each panel, also while typing in a field. event.code keeps it layout independent.
      const panel = event.altKey && !mod ? PANELS.find((p) => event.code === `Digit${p.shortcut}`) : undefined;
      if (panel) {
        event.preventDefault();
        const ui = useUiStore.getState();
        const prefs = usePreferencesStore.getState();
        const visible = !ui.focusMode && !prefs.hiddenPanels[panel.id];
        if (ui.focusMode) ui.setFocusMode(false);
        prefs.setPanelHidden(panel.id, visible);
        return;
      }
      if (typing) return;
      if (key === 'delete' || key === 'backspace') {
        if (useUiStore.getState().selection) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (key === 'e' && !mod && !event.altKey) {
        event.preventDefault();
        addEntity();
        return;
      }
      if (key === 'f' && !mod && !event.altKey) {
        event.preventDefault();
        const { focusMode, setFocusMode } = useUiStore.getState();
        setFocusMode(!focusMode);
        return;
      }
      if (key === 'escape') {
        const ui = useUiStore.getState();
        if (ui.contextMenu) ui.closeContextMenu();
        else if (ui.selection) ui.select(null);
        else if (ui.focusMode) ui.setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};

export default useKeyboardShortcuts;
