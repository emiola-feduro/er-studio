import type { ReactNode } from 'react';
import usePanels from '../../../hooks/ui/use-panels';
import { PANELS } from '../../../stores/use-preferences-store';
import Menu from '../../ui/menu/menu';

type PanelsMenuProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
};

/** Shows or hides each panel, plus the shortcut that leaves only the diagram. */
const PanelsMenu = ({ trigger }: PanelsMenuProps) => {
  const { isVisible, setVisible, focusMode, setFocusMode } = usePanels();

  return (
    <Menu
      trigger={trigger}
      items={[
        { label: 'Solo diagrama', hint: 'F', checked: focusMode, onSelect: () => setFocusMode(!focusMode) },
        ...PANELS.map(({ id, label }, i) => ({
          label,
          checked: isVisible(id),
          separatorBefore: i === 0,
          onSelect: () => setVisible(id, !isVisible(id)),
        })),
      ]}
    />
  );
};

export default PanelsMenu;
