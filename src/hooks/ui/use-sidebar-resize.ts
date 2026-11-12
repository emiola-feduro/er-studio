import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react';
import usePreferencesStore, { SIDEBAR_WIDTH } from '../../stores/use-preferences-store';

const KEY_STEP = 16;

/** Drag, keyboard and double click handlers for the sidebar resize handle. */
const useSidebarResize = () => {
  const width = usePreferencesStore((s) => s.sidebarWidth);
  const setWidth = usePreferencesStore((s) => s.setSidebarWidth);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = usePreferencesStore.getState().sidebarWidth;
      setDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (move: globalThis.PointerEvent) => setWidth(startWidth + move.clientX - startX);
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
    [setWidth],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const current = usePreferencesStore.getState().sidebarWidth;
      const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
      const next = {
        ArrowLeft: current - step,
        ArrowRight: current + step,
        Home: SIDEBAR_WIDTH.min,
        End: SIDEBAR_WIDTH.max,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setWidth(next);
    },
    [setWidth],
  );

  const reset = useCallback(() => setWidth(SIDEBAR_WIDTH.default), [setWidth]);

  return { width, dragging, onPointerDown, onKeyDown, reset };
};

export default useSidebarResize;
