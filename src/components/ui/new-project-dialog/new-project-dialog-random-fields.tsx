import { themeName } from '../../../domain/random-model';
import { LOCALES, type Locale } from '../../../i18n';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useT from '../../../hooks/ui/use-t';
import type useNewProjectForm from '../../../hooks/model/use-new-project-form';
import { MAX_RECORDS } from '../../../hooks/model/use-new-project-form';
import Checkbox from '../checkbox/checkbox';

type RandomFields = ReturnType<typeof useNewProjectForm>['random'];

const NewProjectDialogRandomFields = ({ random }: { random: RandomFields }) => {
  const t = useT();
  const {
    themes,
    themeId,
    setThemeId,
    entityCount,
    setEntityCount,
    minCount,
    maxCount,
    withRecords,
    setWithRecords,
    recordCount,
    setRecordCount,
    namesLocale,
    setNamesLocale,
  } = random;
  const locale = usePreferencesStore((s) => s.locale);

  return (
    <div className="space-y-4 rounded-theme border-(length:--bw) border-line bg-surface-2 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="random-theme" className="block font-medium">
            {t('newProject.theme')}
          </label>
          <select id="random-theme" className="field" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">{t('newProject.anyTheme')}</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {themeName(theme, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="random-entities" className="block font-medium">
            {t('newProject.entities')}
          </label>
          <input
            id="random-entities"
            type="number"
            className="field tabular-nums"
            min={minCount}
            max={maxCount}
            value={entityCount}
            onChange={(e) => setEntityCount(e.target.valueAsNumber)}
            aria-describedby="random-entities-range"
          />
          <span id="random-entities-range" className="block text-[0.9em] text-muted">
            {t('newProject.range', { min: minCount, max: maxCount })}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="random-names-locale" className="block font-medium">
          {t('newProject.namesLanguage')}
        </label>
        <select id="random-names-locale" className="field sm:w-1/2" value={namesLocale} onChange={(e) => setNamesLocale(e.target.value as Locale)}>
          {LOCALES.map(({ id, name }) => (
            <option key={id} value={id} lang={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <Checkbox label={t('newProject.withRecords')} checked={withRecords} onChange={setWithRecords} />
      {withRecords && (
        <div className="space-y-1.5">
          <label htmlFor="random-records" className="block font-medium">
            {t('newProject.recordCount')}
          </label>
          <input
            id="random-records"
            type="number"
            className="field w-32 tabular-nums"
            min={1}
            max={MAX_RECORDS}
            value={recordCount}
            onChange={(e) => setRecordCount(e.target.valueAsNumber)}
            aria-describedby="random-records-range"
          />
          <span id="random-records-range" className="block text-[0.9em] text-muted">
            {t('newProject.max', { max: MAX_RECORDS })}
          </span>
        </div>
      )}
    </div>
  );
};

export default NewProjectDialogRandomFields;
