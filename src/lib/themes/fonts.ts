export type FontCategory = 'Legibles' | 'Sans serif' | 'Serif' | 'Monoespaciadas' | 'Display' | 'Divertidas';

export type FontDef = {
  id: string;
  name: string;
  stack: string;
  category: FontCategory;
  /** Google Fonts family parameter, e.g. "Lexend:wght@400;600;700" */
  google?: string;
  /** Stylesheets from a CDN for fonts that are not on Google Fonts */
  css?: string[];
};

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const sans = (family: string) => `"${family}", ${SYSTEM}`;
const serif = (family: string) => `"${family}", Georgia, "Times New Roman", serif`;
const mono = (family: string) => `"${family}", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;

const g = (
  name: string,
  category: FontCategory,
  weights: string | null,
  stack: (f: string) => string = sans,
): FontDef => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  category,
  stack: stack(name),
  google: `${name.replace(/ /g, '+')}${weights ? `:wght@${weights}` : ''}`,
});

export const FONTS: FontDef[] = [
  { id: 'system', name: 'Sistema', category: 'Legibles', stack: SYSTEM },
  g('Atkinson Hyperlegible', 'Legibles', '400;700'),
  g('Atkinson Hyperlegible Mono', 'Legibles', '400;500;700', mono),
  g('Lexend', 'Legibles', '400;500;600;700'),
  g('Inter', 'Sans serif', '400;500;600;700'),
  g('DM Sans', 'Sans serif', '400;500;600;700'),
  g('Space Grotesk', 'Sans serif', '400;500;600;700'),
  g('Work Sans', 'Sans serif', '400;500;600;700'),
  g('Manrope', 'Sans serif', '400;500;600;700'),
  g('Nunito', 'Sans serif', '400;600;700'),
  g('Cabin', 'Sans serif', '400;500;600;700'),
  g('Comfortaa', 'Sans serif', '400;600;700'),
  g('Quicksand', 'Sans serif', '400;500;600;700'),
  g('Source Serif 4', 'Serif', '400;600;700', serif),
  g('Playfair Display', 'Serif', '400;600;700', serif),
  g('Merriweather', 'Serif', '400;700', serif),
  g('Lora', 'Serif', '400;600;700', serif),
  g('EB Garamond', 'Serif', '400;600;700', serif),
  g('Libre Baskerville', 'Serif', '400;700', serif),
  g('Arima', 'Serif', '400;600;700'),
  g('IBM Plex Mono', 'Monoespaciadas', '400;500;600;700', mono),
  {
    id: 'iosevka',
    name: 'Iosevka',
    category: 'Monoespaciadas',
    stack: mono('Iosevka'),
    css: [
      'https://cdn.jsdelivr.net/npm/@fontsource/iosevka@5.3.0/400.css',
      'https://cdn.jsdelivr.net/npm/@fontsource/iosevka@5.3.0/700.css',
    ],
  },
  g('JetBrains Mono', 'Monoespaciadas', '400;500;600;700', mono),
  g('Fira Code', 'Monoespaciadas', '400;500;600;700', mono),
  g('Space Mono', 'Monoespaciadas', '400;700', mono),
  g('Courier Prime', 'Monoespaciadas', '400;700', mono),
  g('Major Mono Display', 'Monoespaciadas', null, mono),
  g('Audiowide', 'Display', null),
  g('Orbitron', 'Display', '400;600;700'),
  g('Righteous', 'Display', null),
  g('Bungee', 'Display', null),
  g('Monoton', 'Display', null),
  g('Lobster', 'Display', null),
  g('Fredoka', 'Display', '400;500;600;700'),
  g('Cabin Sketch', 'Divertidas', '400;700'),
  g('Press Start 2P', 'Divertidas', null, mono),
  g('VT323', 'Divertidas', null, mono),
  g('Silkscreen', 'Divertidas', '400;700', mono),
  g('Special Elite', 'Divertidas', null, mono),
  g('Permanent Marker', 'Divertidas', null),
  g('Caveat', 'Divertidas', '400;700'),
  g('Indie Flower', 'Divertidas', null),
  g('Pacifico', 'Divertidas', null),
  g('Bangers', 'Divertidas', null),
  g('Creepster', 'Divertidas', null),
  g('Rubik Glitch', 'Divertidas', null),
  g('Nabla', 'Divertidas', null),
];

export const FONT_CATEGORIES: FontCategory[] = ['Legibles', 'Sans serif', 'Serif', 'Monoespaciadas', 'Display', 'Divertidas'];

export const getFont = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

const loaded = new Set<string>();

/** Injects the stylesheet for a font once. */
export const loadFont = (font: FontDef) => {
  if (typeof document === 'undefined' || loaded.has(font.id)) return;
  loaded.add(font.id);
  const urls = font.google
    ? [`https://fonts.googleapis.com/css2?family=${font.google}&display=swap`]
    : (font.css ?? []);
  for (const href of urls) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = href;
    link.dataset.font = font.id;
    document.head.appendChild(link);
  }
};

/** Loads a whole list of fonts in a single Google request, used by the font picker previews. */
export const loadFontPreviews = (fonts: FontDef[]) => {
  const pending = fonts.filter((f) => !loaded.has(f.id));
  const google = pending.filter((f) => f.google);
  if (google.length) {
    const families = google.map((f) => `family=${f.google}`).join('&');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
    for (const f of google) loaded.add(f.id);
  }
  for (const f of pending.filter((p) => !p.google)) loadFont(f);
};
