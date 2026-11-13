import usePanels from '../../../hooks/ui/use-panels';
import Button from '../../ui/button/button';
import PanelsMenu from './panels-menu';

/** Way back when the header is hidden: the Paneles menu, or leaving "Solo diagrama". */
const PanelsRestoreButton = () => {
  const { isVisible, focusMode, setFocusMode } = usePanels();
  if (!focusMode && isVisible('header')) return null;

  return focusMode ? (
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
  );
};

export default PanelsRestoreButton;
