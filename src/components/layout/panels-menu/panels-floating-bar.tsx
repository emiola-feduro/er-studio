import usePanels from '../../../hooks/ui/use-panels';
import PanelsRestoreButton from './panels-restore-button';

/**
 * Floating version of the restore button for the diagram, whose top right corner is free.
 * The SQL and records views put the button in their own toolbar instead, so it never covers their actions.
 */
const PanelsFloatingBar = () => {
  const { isVisible, focusMode } = usePanels();
  if (!focusMode && isVisible('header')) return null;

  return (
    <div className="absolute top-3 right-3 z-20 rounded-theme border-(length:--bw) border-line bg-surface/90 p-1.5 shadow-theme backdrop-blur-sm">
      <PanelsRestoreButton />
    </div>
  );
};

export default PanelsFloatingBar;
