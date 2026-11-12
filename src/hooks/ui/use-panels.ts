import { useCallback } from 'react';
import usePreferencesStore, { type PanelId } from '../../stores/use-preferences-store';
import useUiStore from '../../stores/use-ui-store';

/**
 * Which panels are on screen. "Solo diagrama" hides all of them without touching the saved choices,
 * so leaving it brings back the layout the person had.
 */
const usePanels = () => {
  const hidden = usePreferencesStore((s) => s.hiddenPanels);
  const setPanelHidden = usePreferencesStore((s) => s.setPanelHidden);
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);

  const isVisible = useCallback((id: PanelId) => !focusMode && !hidden[id], [focusMode, hidden]);

  const setVisible = useCallback(
    (id: PanelId, visible: boolean) => {
      // Picking a panel while everything is hidden starts from the saved layout.
      if (focusMode) setFocusMode(false);
      setPanelHidden(id, !visible);
    },
    [focusMode, setFocusMode, setPanelHidden],
  );

  const sidebar = isVisible('projects') || isVisible('tables') || isVisible('relationships');

  return { isVisible, setVisible, sidebar, focusMode, setFocusMode };
};

export default usePanels;
