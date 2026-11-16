import type { KeyboardEvent, PointerEvent } from 'react';
import useT from '../../../hooks/ui/use-t';

type ColumnResizeHandleProps = {
  column: string;
  width: number;
  onResize: (width: number) => void;
  /** Double click or Enter: fit the column to its content. */
  onFit: () => void;
};

const STEP = 16;

/** Border of a header cell that changes the column width by dragging or with the arrow keys. */
const ColumnResizeHandle = ({ column, width, onResize, onFit }: ColumnResizeHandleProps) => {
  const t = useT();

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: globalThis.PointerEvent) => onResize(startWidth + e.clientX - startX);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.style.removeProperty('cursor');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    document.body.style.cursor = 'col-resize';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(width + (event.key === 'ArrowRight' ? STEP : -STEP));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onFit();
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('columns.resize', { name: column })}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      title={t('columns.resizeHint')}
      onPointerDown={onPointerDown}
      onDoubleClick={onFit}
      onKeyDown={onKeyDown}
      className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-transparent hover:after:bg-accent focus-visible:after:bg-accent"
    />
  );
};

export default ColumnResizeHandle;
