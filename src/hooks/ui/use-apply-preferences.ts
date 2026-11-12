import { useEffect } from 'react';
import { getFont, loadFont } from '../../lib/themes/fonts';
import { getTheme, themeVariables } from '../../lib/themes/themes';
import usePreferencesStore from '../../stores/use-preferences-store';

const TEXT_SCALE = { sm: '0.93', md: '1', lg: '1.12' } as const;
const EXTRA_CSS_ID = 'er-theme-extra';

/** Applies theme variables, fonts and text size to the document root. */
const useApplyPreferences = () => {
  const themeId = usePreferencesStore((s) => s.themeId);
  const uiFontId = usePreferencesStore((s) => s.uiFontId);
  const canvasFontId = usePreferencesStore((s) => s.canvasFontId);
  const sqlFontId = usePreferencesStore((s) => s.sqlFontId);
  const textSize = usePreferencesStore((s) => s.textSize);

  useEffect(() => {
    const theme = getTheme(themeId);
    const root = document.documentElement;
    for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.dark ? 'dark' : 'light';

    let style = document.getElementById(EXTRA_CSS_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = EXTRA_CSS_ID;
      document.head.appendChild(style);
    }
    style.textContent = theme.extraCss ?? '';
  }, [themeId]);

  useEffect(() => {
    const font = getFont(uiFontId);
    loadFont(font);
    document.documentElement.style.setProperty('--font-ui-stack', font.stack);
  }, [uiFontId]);

  useEffect(() => {
    const font = getFont(canvasFontId);
    loadFont(font);
    document.documentElement.style.setProperty('--font-canvas-stack', font.stack);
  }, [canvasFontId]);

  useEffect(() => {
    const font = getFont(sqlFontId);
    loadFont(font);
    document.documentElement.style.setProperty('--font-sql-stack', font.stack);
  }, [sqlFontId]);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', TEXT_SCALE[textSize]);
  }, [textSize]);
};

export default useApplyPreferences;
