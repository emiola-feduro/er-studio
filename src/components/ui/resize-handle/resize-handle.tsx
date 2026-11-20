import usePanelResize from '../../../hooks/ui/use-panel-resize';
import useT from '../../../hooks/ui/use-t';
import type { ResizablePanel } from '../../../stores/use-preferences-store';

type ResizeHandleProps = {
  panel: ResizablePanel;
  label: string;
};

// Where the handle sits on each panel: the inner edge, the one next to the content it shares space with.
const PLACEMENT = {
  sidebar: 'inset-y-0 -right-1.5 w-3 cursor-col-resize',
  queryBuilder: 'inset-y-0 -right-1.5 w-3 cursor-col-resize',
  inspector: 'inset-y-0 -left-1.5 w-3 cursor-col-resize',
  queryResults: 'inset-x-0 -top-1.5 h-3 cursor-row-resize',
  terminal: 'inset-x-0 -top-1.5 h-3 cursor-row-resize',
};

/** Splitter on a panel's inner edge. Drag, use the arrow keys, or double click to reset. */
const ResizeHandle = ({ panel, label }: ResizeHandleProps) => {
  const t = useT();
  const { width, limits, vertical, dragging, onPointerDown, onKeyDown, reset } = usePanelResize(panel);

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      title={t('sidebar.resizeHint')}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
      className={`group absolute z-20 hidden touch-none ${vertical || panel === 'queryBuilder' ? 'md:block' : 'lg:block'} ${PLACEMENT[panel]}`}
    >
      <span
        className={`absolute transition-colors ${vertical ? 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2' : 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'} ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent group-focus-visible:bg-accent'}`}
      />
    </div>
  );
};

export default ResizeHandle;
