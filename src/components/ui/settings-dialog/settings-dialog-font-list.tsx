import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { useEffect, useState } from 'react';
import { matchesQuery } from '../../../lib/search';
import { FONT_CATEGORIES, FONTS, fontName, loadFontPreviews } from '../../../lib/themes/fonts';
import usePreferencesStore from '../../../stores/use-preferences-store';
import Checkbox from '../checkbox/checkbox';
import SearchInput from '../search-input/search-input';
import SegmentedControl from '../segmented-control/segmented-control';

type Target = 'ui' | 'canvas' | 'sql';

const SAMPLE = { ui: 'cliente_id INTEGER, pedido 1:N', canvas: 'cliente_id INTEGER, pedido 1:N', sql: 'SELECT id FROM cliente;' };

const SettingsDialogFontList = () => {
  const t = useT();
  const uiFontId = usePreferencesStore((s) => s.uiFontId);
  const canvasFontId = usePreferencesStore((s) => s.canvasFontId);
  const setUiFont = usePreferencesStore((s) => s.setUiFont);
  const setCanvasFont = usePreferencesStore((s) => s.setCanvasFont);
  const sqlFontId = usePreferencesStore((s) => s.sqlFontId);
  const setSqlFont = usePreferencesStore((s) => s.setSqlFont);
  const [target, setTarget] = useState<Target>('ui');
  const [linked, setLinked] = useState(uiFontId === canvasFontId && canvasFontId === sqlFontId);
  const [query, setQuery] = useState('');
  const visible = FONTS.filter((f) => matchesQuery(query, fontName(f, t), f.category, t(`fontCategory.${f.category}` as MessageKey)));

  useEffect(() => loadFontPreviews(FONTS), []);

  const current = { ui: uiFontId, canvas: canvasFontId, sql: sqlFontId }[target];
  const choose = (id: string) => {
    if (linked) {
      setUiFont(id);
      setCanvasFont(id);
      setSqlFont(id);
    } else ({ ui: setUiFont, canvas: setCanvasFont, sql: setSqlFont })[target](id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox label={t('settings.sameFont')} checked={linked} onChange={setLinked} />
        {!linked && (
          <SegmentedControl
            label={t('settings.applyTo')}
            value={target}
            onChange={setTarget}
            size="sm"
            options={[
              { value: 'ui', label: t('settings.interface') },
              { value: 'canvas', label: t('settings.diagram') },
              { value: 'sql', label: t('settings.sqlCode') },
            ]}
          />
        )}
      </div>
      <SearchInput id="font-search" label={t('settings.searchFonts')} placeholder={t('settings.searchFontsPlaceholder')} value={query} onChange={setQuery} autoFocus />
      {visible.length === 0 && <p className="text-muted">{t('settings.noFont', { query })}</p>}
      {FONT_CATEGORIES.filter((category) => visible.some((f) => f.category === category)).map((category) => (
        <section key={category}>
          <h3 className="mb-2 font-semibold">{t(`fontCategory.${category}` as MessageKey)}</h3>
          <div role="radiogroup" aria-label={t(`fontCategory.${category}` as MessageKey)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visible
              .filter((f) => f.category === category)
              .map((font) => (
                <button
                  key={font.id}
                  type="button"
                  role="radio"
                  aria-checked={font.id === current}
                  onClick={() => choose(font.id)}
                  className={`rounded-theme border-(length:--bw) px-3 py-2 text-left transition-colors ${font.id === current ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
                >
                  <span className="block text-[0.85em] text-muted">{fontName(font, t)}</span>
                  <span className="block truncate text-[1.1em]" style={{ fontFamily: font.stack }}>
                    {SAMPLE[linked ? 'ui' : target]}
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default SettingsDialogFontList;
