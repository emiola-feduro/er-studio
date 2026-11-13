import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { FONT_CATEGORIES, FONTS, fontName } from '../../../lib/themes/fonts';
import usePreferencesStore from '../../../stores/use-preferences-store';

/** Font for the SQL code. Monospaced fonts are listed first because they keep columns aligned. */
const ORDER = ['Monoespaciadas', ...FONT_CATEGORIES.filter((c) => c !== 'Monoespaciadas')] as const;

const SqlPreviewFontSelect = () => {
  const t = useT();
  const sqlFontId = usePreferencesStore((s) => s.sqlFontId);
  const setSqlFont = usePreferencesStore((s) => s.setSqlFont);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sql-font" className="text-muted">
        {t('sql.font')}
      </label>
      <select id="sql-font" className="field field-sm w-36" value={sqlFontId} onChange={(e) => setSqlFont(e.target.value)}>
        {ORDER.map((category) => (
          <optgroup key={category} label={t(`fontCategory.${category}` as MessageKey)}>
            {FONTS.filter((f) => f.category === category).map((font) => (
              <option key={font.id} value={font.id}>
                {fontName(font, t)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

export default SqlPreviewFontSelect;
