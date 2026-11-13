import useT from '../../../hooks/ui/use-t';
import { LOCALES, type Locale } from '../../../i18n';
import usePreferencesStore from '../../../stores/use-preferences-store';

/** Interface language. Lives in Appearance so the header keeps room for the views. */
const SettingsDialogLanguage = () => {
  const t = useT();
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language" className="text-muted">
        {t('topBar.language')}
      </label>
      <select id="language" className="field field-sm w-auto" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {LOCALES.map(({ id, name }) => (
          <option key={id} value={id} lang={id}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SettingsDialogLanguage;
