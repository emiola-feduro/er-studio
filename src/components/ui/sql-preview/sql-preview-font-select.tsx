import { FONT_CATEGORIES, FONTS } from '../../../lib/themes/fonts';
import usePreferencesStore from '../../../stores/use-preferences-store';

/** Font for the SQL code. Monospaced fonts are listed first because they keep columns aligned. */
const ORDER = ['Monoespaciadas', ...FONT_CATEGORIES.filter((c) => c !== 'Monoespaciadas')] as const;

const SqlPreviewFontSelect = () => {
  const sqlFontId = usePreferencesStore((s) => s.sqlFontId);
  const setSqlFont = usePreferencesStore((s) => s.setSqlFont);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sql-font" className="text-muted">
        Fuente
      </label>
      <select id="sql-font" className="field field-sm w-36" value={sqlFontId} onChange={(e) => setSqlFont(e.target.value)}>
        {ORDER.map((category) => (
          <optgroup key={category} label={category}>
            {FONTS.filter((f) => f.category === category).map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

export default SqlPreviewFontSelect;
