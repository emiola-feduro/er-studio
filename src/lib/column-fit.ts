/**
 * Width that fits a column's content, the way Excel's double click on a column border does: the
 * widest of the header and the values, plus padding, within limits.
 */

export type FitOptions = { extra: number; min: number; max: number; headerExtra?: number };

export const fitWidth = (header: string[], values: string[], measure: (text: string, bold?: boolean) => number, { extra, min, max, headerExtra = extra }: FitOptions) => {
  let widest = 0;
  for (const text of header) widest = Math.max(widest, measure(text, true) + headerExtra);
  for (const text of values) widest = Math.max(widest, measure(text) + extra);
  return Math.round(Math.min(max, Math.max(min, widest)));
};

// Rows looked at for the width; enough to be representative without measuring thousands.
export const SAMPLE_ROWS = 300;

let canvas: HTMLCanvasElement | undefined;

/** Measures text in the given CSS font with a canvas; falls back to an estimate where there is none. */
export const textMeasurer = (font: string) => {
  canvas ??= typeof document !== 'undefined' ? document.createElement('canvas') : undefined;
  const context = canvas?.getContext('2d') ?? null;
  const cache = new Map<string, number>();
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  return (text: string, bold = false) => {
    const key = `${bold ? 'b' : 'n'}${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      if (context) {
        context.font = bold ? font.replace(/^(normal|italic|oblique)\s+/, '$1 600 ') : font;
        width = context.measureText(text).width;
      } else width = text.length * size * 0.6;
      cache.set(key, width);
    }
    return width;
  };
};

/**
 * Widths shown on screen: when the columns need less than the space there is, each one grows in
 * proportion so the table fills it; when they need more, they keep their width and the table scrolls.
 */
export const fillWidths = (natural: number[], available: number) => {
  const total = natural.reduce((sum, w) => sum + w, 0);
  if (!total || total >= available) return natural;
  const scale = available / total;
  return natural.map((w) => w * scale);
};

/**
 * The width to keep for a column so that, after filling the space, it shows exactly `shown` pixels
 * (where the pointer is while dragging). `others` is the kept width of the other columns.
 */
export const naturalForShown = (shown: number, others: number, available: number) => {
  // Everything fits without growing: the table scrolls and the width is the one shown.
  if (shown + others >= available || shown >= available) return shown;
  return (shown * others) / (available - shown);
};
