import { EyeOff } from 'lucide-react';
import useT from '../../../hooks/ui/use-t';
import usePreferencesStore, { PANELS, panelShortcut, type PanelId } from '../../../stores/use-preferences-store';
import IconButton from '../icon-button/icon-button';

/** Hides one panel. It comes back from the Paneles menu or its Alt shortcut. */
const PanelHideButton = ({ panel }: { panel: PanelId }) => {
  const t = useT();
  const setPanelHidden = usePreferencesStore((s) => s.setPanelHidden);
  const locale = usePreferencesStore((s) => s.locale);
  const name = t(PANELS.find((p) => p.id === panel)!.label).toLocaleLowerCase(locale);

  return (
    <IconButton label={t('panels.hide', { name, shortcut: panelShortcut(panel) })} size="sm" onClick={() => setPanelHidden(panel, true)}>
      <EyeOff size={15} />
    </IconButton>
  );
};

export default PanelHideButton;
