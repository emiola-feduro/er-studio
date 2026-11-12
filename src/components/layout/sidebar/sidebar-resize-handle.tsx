import useSidebarResize from '../../../hooks/ui/use-sidebar-resize';
import { SIDEBAR_WIDTH } from '../../../stores/use-preferences-store';

/** Vertical splitter on the sidebar's right edge. Drag, use the arrow keys, or double click to reset. */
const SidebarResizeHandle = () => {
  const { width, dragging, onPointerDown, onKeyDown, reset } = useSidebarResize();

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del panel de proyectos"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      tabIndex={0}
      title="Arrastra para cambiar el ancho. Doble clic para restablecerlo."
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
      className="group absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize touch-none lg:block"
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent group-focus-visible:bg-accent'}`}
      />
    </div>
  );
};

export default SidebarResizeHandle;
