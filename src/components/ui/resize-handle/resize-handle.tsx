import usePanelResize from '../../../hooks/ui/use-panel-resize';
import useT from '../../../hooks/ui/use-t';
import type { ResizablePanel } from '../../../stores/use-preferences-store';

type ResizeHandleProps = {
  panel: ResizablePanel;
  label: string;
};

/** Vertical splitter on a side panel's inner edge. Drag, use the arrow keys, or double click to reset. */
const ResizeHandle = ({ panel, label }: ResizeHandleProps) => {
  const t = useT();
  const { width, limits, dragging, onPointerDown, onKeyDown, reset } = usePanelResize(panel);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      title={t('sidebar.resizeHint')}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
      className={`group absolute inset-y-0 z-20 hidden w-3 cursor-col-resize touch-none lg:block ${panel === 'sidebar' ? '-right-1.5' : '-left-1.5'}`}
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent group-focus-visible:bg-accent'}`}
      />
    </div>
  );
};

export default ResizeHandle;
