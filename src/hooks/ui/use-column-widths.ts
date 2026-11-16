import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { fillWidths, fitWidth, naturalForShown, SAMPLE_ROWS, textMeasurer, type FitOptions } from '../../lib/column-fit';
import useColumnWidthStore from '../../stores/use-column-width-store';

export type FitColumn = { key: string; header: string[]; values: string[] };

export const MIN_COLUMN_WIDTH = 48;

/**
 * Column widths for a table: fitted to the content by default, or the width the person dragged.
 * Double click on a border (or reset) goes back to fitting, as in Excel. The table always fills
 * the width of its container: the columns grow in proportion, and scroll only when they need more.
 */
const useColumnWidths = (
  scope: string,
  columns: FitColumn[],
  tableRef: RefObject<HTMLElement | null>,
  options: FitOptions,
  /** CSS selector, inside the table, of the element whose font the values use (an input, say). */
  valueSelector?: string,
  /** Width taken by columns that never change (row number, actions). */
  fixedWidth = 0,
) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [font, setFont] = useState('13px sans-serif');
  // Bumped when web fonts finish loading: measures taken with the fallback font are wrong.
  const [fontsLoaded, setFontsLoaded] = useState(0);
  const saved = useColumnWidthStore((s) => s.widths);

  // The real font of the values (theme, chosen font and text size), read once they are on screen.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const element = (valueSelector && table.querySelector(valueSelector)) || table;
    const style = getComputedStyle(element);
    const next = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
    setFont((current) => (current === next ? current : next));
  });

  // The space to fill: the scrolling box around the table.
  useEffect(() => {
    const box = tableRef.current?.parentElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setContainerWidth(box.clientWidth));
    observer.observe(box);
    setContainerWidth(box.clientWidth);
    return () => observer.disconnect();
  });

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const bump = () => setFontsLoaded((n) => n + 1);
    let active = true;
    void document.fonts.ready.then(() => active && bump());
    document.fonts.addEventListener('loadingdone', bump);
    return () => {
      active = false;
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, []);

  const { extra, min, max, headerExtra } = options;
  const fitted = useMemo(() => {
    const measure = textMeasurer(font);
    return Object.fromEntries(
      columns.map((c) => [c.key, fitWidth(c.header, c.values.slice(0, SAMPLE_ROWS), measure, { extra, min, max, headerExtra })]),
    ) as Record<string, number>;
    // fontsLoaded is not read, but a new value means the same font string now draws differently.
  }, [columns, font, fontsLoaded, extra, min, max, headerExtra]);

  const naturalOf = (key: string) => saved[`${scope}:${key}`] ?? fitted[key] ?? min;
  const keys = columns.map((c) => c.key);
  const available = Math.max(0, containerWidth - fixedWidth);
  const shown = fillWidths(keys.map(naturalOf), available);
  const shownByKey = new Map(keys.map((key, i) => [key, Math.floor(shown[i])]));
  const { setWidth, clearWidth } = useColumnWidthStore.getState();

  return {
    /** Width on screen, after filling the container. */
    widthOf: (key: string) => shownByKey.get(key) ?? naturalOf(key),
    /** Sum of the columns on screen, plus the fixed ones. */
    total: [...shownByKey.values()].reduce((sum, w) => sum + w, 0) + fixedWidth,
    isCustom: (key: string) => `${scope}:${key}` in saved,
    /** Makes a column show `width` pixels; the others adjust so the table still fills its space. */
    resize: (key: string, width: number) => {
      const others = keys.filter((k) => k !== key).reduce((sum, k) => sum + naturalOf(k), 0);
      const target = Math.max(MIN_COLUMN_WIDTH, width);
      setWidth(`${scope}:${key}`, Math.max(MIN_COLUMN_WIDTH / 4, naturalForShown(target, others, available)));
    },
    fit: (key: string) => clearWidth(`${scope}:${key}`),
  };
};

export default useColumnWidths;
