import useT from '../../../hooks/ui/use-t';
import { LOCALES, type Locale } from '../../../i18n';
import usePreferencesStore from '../../../stores/use-preferences-store';

const TopBarLanguageSelect = () => {
  const t = useT();
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  return (
    <div>
      <label htmlFor="language" className="sr-only">
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

export default TopBarLanguageSelect;
