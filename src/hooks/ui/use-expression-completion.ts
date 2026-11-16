import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';

export type ExpressionSuggestionItem = { value: string; label?: string; display?: string };

/**
 * Whole expressions (CHECK, index WHERE), or a function that continues the text before the cursor:
 * each value it returns is the new text before the cursor, and `display` is what the list shows.
 */
export type SuggestionSource = ExpressionSuggestionItem[] | ((before: string, after: string) => ExpressionSuggestionItem[]);

export type CompletionOption = ExpressionSuggestionItem & { kind: 'suggestion' | 'column' };

const MAX_OPTIONS = 8;
// Includes dots so qualified names (pr.precio) complete too.
const PARTIAL_WORD = /([A-Za-z_][A-Za-z0-9_.]*)$/;

/**
 * Autocomplete for a SQL expression field, worked out from the text before the cursor: suggestions
 * and column names that complete the word being typed. Arrows choose, Enter or Tab accept, Escape
 * closes. In a multi-line field, arrows and Enter keep their usual meaning while the list is closed.
 */
const useExpressionCompletion = (value: string, onChange: (value: string) => void, source: SuggestionSource, columns: string[], multiline = false) => {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  // Cursor position; null means the end of the text.
  const [caret, setCaret] = useState<number | null>(null);
  // Where the cursor goes after accepting an option; the field applies it.
  const [nextCaret, setNextCaret] = useState<{ position: number } | null>(null);

  const cut = Math.min(caret ?? value.length, value.length);
  const before = value.slice(0, cut);
  const after = value.slice(cut);

  const options = useMemo((): CompletionOption[] => {
    const partial = PARTIAL_WORD.exec(before)?.[1] ?? '';
    const lower = partial.toLowerCase();
    // "pre" also finds "pr.precio": a qualified name matches by its column part too.
    const matches = (c: string) => {
      const name = c.toLowerCase();
      return name !== lower && (name.startsWith(lower) || (!lower.includes('.') && name.split('.').pop()!.startsWith(lower)));
    };
    const columnPart = (c: string) => c.split('.').pop()!.length;
    const columnOptions = partial
      ? columns
          .filter(matches)
          .sort((x, y) => columnPart(x) - columnPart(y))
          .map((c) => ({ value: c, kind: 'column' as const }))
      : [];
    let suggestionOptions: CompletionOption[];
    if (typeof source === 'function') {
      suggestionOptions = source(before, after)
        .filter((s) => s.value !== before)
        .map((s) => ({ ...s, kind: 'suggestion' as const }));
    } else {
      const text = value.trim().toLowerCase();
      suggestionOptions = source
        .filter((s) => s.value !== value.trim() && (!text || s.value.toLowerCase().includes(text) || s.label?.toLowerCase().includes(text)))
        .map((s) => ({ ...s, kind: 'suggestion' as const }));
    }
    return [...columnOptions, ...suggestionOptions].slice(0, MAX_OPTIONS);
  }, [value, before, after, source, columns]);

  const open = focused && !dismissed && options.length > 0;
  // Stable, because the floating list re-measures whenever its dismiss callback changes.
  const close = useCallback(() => setDismissed(true), []);
  const current = Math.min(active, options.length - 1);

  const apply = (option: CompletionOption) => {
    let head: string;
    let tail = after;
    if (option.kind === 'column') head = before.replace(PARTIAL_WORD, option.value);
    else if (typeof source === 'function') head = option.value;
    else {
      head = option.value;
      tail = '';
    }
    onChange(head + tail);
    setCaret(head.length);
    setNextCaret({ position: head.length });
    setActive(0);
    // Stays open: what was accepted may lead to the next step (operators after a column, AND after a condition).
    setDismissed(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length || (multiline && !open)) return;
      event.preventDefault();
      setDismissed(false);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (Math.min(i, options.length - 1) + step + options.length) % options.length);
      return;
    }
    if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) && open) {
      event.preventDefault();
      apply(options[current]);
    }
  };

  /** Keeps track of the cursor; the field calls it on typing, clicks and key moves. */
  const onCaret = (start: number, end: number) => {
    if (start !== end) return;
    const atEnd = start >= value.length;
    setCaret(atEnd ? null : start);
  };

  return {
    options,
    open,
    active: current,
    apply,
    setActive,
    onKeyDown,
    onCaret,
    nextCaret,
    onFocus: () => {
      setFocused(true);
      setDismissed(false);
    },
    onBlur: () => setFocused(false),
    close,
    onInput: (position: number) => {
      setCaret(position);
      setDismissed(false);
      setActive(0);
    },
  };
};

export default useExpressionCompletion;
