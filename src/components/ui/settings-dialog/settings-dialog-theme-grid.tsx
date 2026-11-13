import useT from '../../../hooks/ui/use-t';
import { THEMES } from '../../../lib/themes/themes';
import usePreferencesStore from '../../../stores/use-preferences-store';
import SettingsDialogThemeCard from './settings-dialog-theme-card';

const SettingsDialogThemeGrid = () => {
  const t = useT();
  const themeId = usePreferencesStore((s) => s.themeId);
  const setTheme = usePreferencesStore((s) => s.setTheme);

  return (
    <div role="radiogroup" aria-label={t('settings.theme')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {THEMES.map((theme) => (
        <SettingsDialogThemeCard key={theme.id} theme={theme} active={theme.id === themeId} onSelect={() => setTheme(theme.id)} />
      ))}
    </div>
  );
};

export default SettingsDialogThemeGrid;
