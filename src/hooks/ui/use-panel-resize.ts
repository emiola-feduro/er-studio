import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react';
import usePreferencesStore, { PANEL_WIDTHS, type ResizablePanel } from '../../stores/use-preferences-store';

const KEY_STEP = 16;

/**
 * Drag, keyboard and double click handlers for a side panel's resize handle. The left panel grows
 * when dragged to the right; the right panel grows when dragged to the left.
 */
const usePanelResize = (panel: ResizablePanel) => {
  const width = usePreferencesStore((s) => s.panelWidths[panel]);
  const setPanelWidth = usePreferencesStore((s) => s.setPanelWidth);
  const [dragging, setDragging] = useState(false);
  const limits = PANEL_WIDTHS[panel];
  const direction = panel === 'sidebar' ? 1 : -1;
  const setWidth = useCallback((value: number) => setPanelWidth(panel, value), [panel, setPanelWidth]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = usePreferencesStore.getState().panelWidths[panel];
      setDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (move: globalThis.PointerEvent) => setWidth(startWidth + (move.clientX - startX) * direction);
      const onUp = () => {
        setDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },
    [panel, direction, setWidth],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const current = usePreferencesStore.getState().panelWidths[panel];
      const step = (event.shiftKey ? KEY_STEP * 4 : KEY_STEP) * direction;
      const next = {
        ArrowLeft: current - step,
        ArrowRight: current + step,
        Home: limits.min,
        End: limits.max,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setWidth(next);
    },
    [panel, direction, limits, setWidth],
  );

  const reset = useCallback(() => setWidth(limits.default), [limits, setWidth]);

  return { width, limits, dragging, onPointerDown, onKeyDown, reset };
};

export default usePanelResize;
