import type { Theme } from './themes';

/** Key read by the inline script in index.html before any JavaScript bundle loads. */
export const BOOT_KEY = 'er-studio:boot';

/**
 * Saves the few colors the loading screen needs, so the next visit starts in the chosen theme
 * instead of flashing white while the app loads.
 */
export const rememberBootTheme = (theme: Theme) => {
  const { bg, surface, fg, muted, border, accent } = theme.colors;
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ bg, surface, fg, muted, border, accent, dark: theme.dark }));
  } catch {
    /* storage may be unavailable; the loader then uses its light defaults */
  }
};
