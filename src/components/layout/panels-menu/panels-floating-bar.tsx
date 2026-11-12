import usePanels from '../../../hooks/ui/use-panels';
import Button from '../../ui/button/button';
import PanelsMenu from './panels-menu';

/** Way back when the header is hidden: the Paneles menu, or leaving "Solo diagrama". */
const PanelsFloatingBar = () => {
  const { isVisible, focusMode, setFocusMode } = usePanels();
  if (!focusMode && isVisible('header')) return null;

  return (
    <div className="absolute top-3 right-3 z-20 flex gap-2 rounded-theme border-(length:--bw) border-line bg-surface/90 p-1.5 shadow-theme backdrop-blur-sm">
      {focusMode ? (
        <Button size="sm" onClick={() => setFocusMode(false)} title="Atajo: F">
          Mostrar paneles
        </Button>
      ) : (
        <PanelsMenu
          trigger={({ open, toggle }) => (
            <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              Paneles
            </Button>
          )}
        />
      )}
    </div>
  );
};

export default PanelsFloatingBar;
