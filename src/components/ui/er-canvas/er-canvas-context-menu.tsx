import useCanvasContextMenu from '../../../hooks/canvas/use-canvas-context-menu';
import useUiStore from '../../../stores/use-ui-store';
import ContextMenu from '../context-menu/context-menu';

const ErCanvasContextMenu = () => {
  const menu = useUiStore((s) => s.contextMenu);
  const close = useUiStore((s) => s.closeContextMenu);
  const content = useCanvasContextMenu(menu);
  if (!menu || !content) return null;

  return <ContextMenu key={`${menu.x}:${menu.y}`} x={menu.x} y={menu.y} label={content.label} items={content.items} onClose={close} />;
};

export default ErCanvasContextMenu;
