import { EyeOff } from 'lucide-react';
import usePreferencesStore, { type PanelId } from '../../../stores/use-preferences-store';
import IconButton from '../icon-button/icon-button';

type PanelHideButtonProps = {
  panel: PanelId;
  label: string;
};

/** Hides one panel. It comes back from the Paneles menu. */
const PanelHideButton = ({ panel, label }: PanelHideButtonProps) => {
  const setPanelHidden = usePreferencesStore((s) => s.setPanelHidden);

  return (
    <IconButton label={`Ocultar ${label}`} size="sm" onClick={() => setPanelHidden(panel, true)}>
      <EyeOff size={15} />
    </IconButton>
  );
};

export default PanelHideButton;
