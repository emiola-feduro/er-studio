import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { fitWidth, SAMPLE_ROWS, textMeasurer, type FitOptions } from '../../lib/column-fit';
import useColumnWidthStore from '../../stores/use-column-width-store';

export type FitColumn = { key: string; header: string[]; values: string[] };

export const MIN_COLUMN_WIDTH = 48;

/**
 * Column widths for a table: fitted to the content by default, or the width the person dragged.
 * Double click on a border (or reset) goes back to fitting, as in Excel.
 */
const useColumnWidths = (scope: string, columns: FitColumn[], tableRef: RefObject<HTMLElement | null>, options: FitOptions) => {
  const [font, setFont] = useState('13px sans-serif');
  const saved = useColumnWidthStore((s) => s.widths);

  // The table's real font (theme, chosen font and text size), read once it is on screen.
  useLayoutEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const next = `${style.fontSize} ${style.fontFamily}`;
    setFont((current) => (current === next ? current : next));
  });

  const { extra, min, max, headerExtra } = options;
  const fitted = useMemo(() => {
    const measure = textMeasurer(font);
    return Object.fromEntries(
      columns.map((c) => [c.key, fitWidth(c.header, c.values.slice(0, SAMPLE_ROWS), measure, { extra, min, max, headerExtra })]),
    ) as Record<string, number>;
  }, [columns, font, extra, min, max, headerExtra]);

  const widthOf = (key: string) => saved[`${scope}:${key}`] ?? fitted[key] ?? min;
  const { setWidth, clearWidth } = useColumnWidthStore.getState();

  return {
    widthOf,
    isCustom: (key: string) => `${scope}:${key}` in saved,
    resize: (key: string, width: number) => setWidth(`${scope}:${key}`, Math.max(MIN_COLUMN_WIDTH, width)),
    fit: (key: string) => clearWidth(`${scope}:${key}`),
  };
};

export default useColumnWidths;
