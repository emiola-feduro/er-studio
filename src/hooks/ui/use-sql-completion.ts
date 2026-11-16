import { useCallback, useEffect, useState, type KeyboardEvent, type RefObject } from 'react';

export type EditorCompletion = { label: string; insert: string; detail?: string };
export type EditorCompletionResult = { from: number; to: number; items: EditorCompletion[] };
export type CompletionSource = (text: string, caret: number) => EditorCompletionResult;

type Position = { top: number; left: number; maxHeight: number };

const GAP = 4;
const MARGIN = 8;

let canvas: HTMLCanvasElement | undefined;

/** Where the caret is on screen, measured with the textarea's own font (the text never wraps). */
const caretPoint = (area: HTMLTextAreaElement, caret: number) => {
  const style = getComputedStyle(area);
  const before = area.value.slice(0, caret);
  const lineIndex = before.split('\n').length - 1;
  const line = before.slice(before.lastIndexOf('\n') + 1).replace(/\t/g, '  ');
  canvas ??= document.createElement('canvas');
  const context = canvas.getContext('2d');
  let width = line.length * parseFloat(style.fontSize) * 0.6;
  if (context) {
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    width = context.measureText(line).width;
  }
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
  const rect = area.getBoundingClientRect();
  return {
    x: rect.left + parseFloat(style.paddingLeft) + width - area.scrollLeft,
    y: rect.top + parseFloat(style.paddingTop) + lineIndex * lineHeight - area.scrollTop,
    lineHeight,
  };
};

/**
 * Autocomplete for a SQL text area: the list follows what is typed, opens with Ctrl+Space, and is
 * placed under the caret (above it when there is no room). Arrows choose, Enter or Tab accept,
 * Escape closes; with the list closed every key does what it always does.
 */
const useSqlCompletion = (
  areaRef: RefObject<HTMLTextAreaElement | null>,
  listRef: RefObject<HTMLElement | null>,
  value: string,
  onChange: (value: string) => void,
  source: CompletionSource | undefined,
) => {
  const [result, setResult] = useState<EditorCompletionResult | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  // Bumped when the editor scrolls, so the list moves with the caret instead of closing.
  const [scrolled, setScrolled] = useState(0);
  const open = Boolean(result && result.items.length);

  const close = useCallback(() => {
    setResult(null);
    setPosition(null);
  }, []);

  const refresh = (text: string, caret: number) => {
    if (!source) return;
    const next = source(text, caret);
    setResult(next.items.length ? next : null);
    setActive(0);
  };

  // Place the list once it is rendered and its height is known.
  useEffect(() => {
    const area = areaRef.current;
    const list = listRef.current;
    if (!open || !area || !list || !result) return;
    const point = caretPoint(area, result.from);
    const height = list.scrollHeight;
    const below = window.innerHeight - (point.y + point.lineHeight) - GAP - MARGIN;
    const above = point.y - GAP - MARGIN;
    const up = height > below && above > below;
    const maxHeight = Math.max(120, Math.min(280, up ? above : below));
    const top = up ? point.y - GAP - Math.min(height, maxHeight) : point.y + point.lineHeight + GAP;
    const left = Math.min(Math.max(MARGIN, point.x), window.innerWidth - list.offsetWidth - MARGIN);
    setPosition({ top, left, maxHeight });
  }, [open, result, scrolled, areaRef, listRef]);

  // After accepting, the caret goes right after the inserted text.
  useEffect(() => {
    if (pendingCaret === null) return;
    areaRef.current?.setSelectionRange(pendingCaret, pendingCaret);
    setPendingCaret(null);
  }, [pendingCaret, areaRef]);

  // Scrolling the page or resizing would leave the list behind, so it closes.
  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      const target = event.target as Node;
      // The editor's own scrolling (the text area and the colored layer under it) moves the list instead.
      const editor = areaRef.current?.parentElement;
      if (!listRef.current?.contains(target) && !editor?.contains(target)) close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, listRef, areaRef]);

  const accept = (index = active) => {
    const item = result?.items[index];
    if (!result || !item) return;
    const next = value.slice(0, result.from) + item.insert + value.slice(result.to);
    const caret = result.from + item.insert.length;
    onChange(next);
    setPendingCaret(caret);
    // What was accepted may lead to the next step (a table, then JOIN or WHERE...).
    refresh(next, caret);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === ' ' && event.ctrlKey) {
      event.preventDefault();
      refresh(value, event.currentTarget.selectionStart);
      return;
    }
    if (!open || !result) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + result.items.length) % result.items.length);
    } else if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      accept();
    }
  };

  /** Typing opens or updates the list; deleting only updates it if it is open. */
  const onInput = (text: string, caret: number, inserted: boolean) => {
    if (inserted || open) refresh(text, caret);
  };

  return { open, items: result?.items ?? [], active, setActive, position, accept, close, onKeyDown, onInput, onScroll: () => setScrolled((n) => n + 1) };
};

export default useSqlCompletion;
