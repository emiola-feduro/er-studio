import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';

export type CompletionOption = { value: string; label?: string; kind: 'suggestion' | 'column' };

const MAX_OPTIONS = 8;
const PARTIAL_WORD = /([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * Autocomplete for a SQL expression field: whole-expression suggestions that match what is typed,
 * and column names that complete the word being typed. Arrows choose, Enter or Tab accept, Escape closes.
 */
const useExpressionCompletion = (value: string, onChange: (value: string) => void, suggestions: { value: string; label?: string }[], columns: string[]) => {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo((): CompletionOption[] => {
    const partial = PARTIAL_WORD.exec(value)?.[1] ?? '';
    const columnOptions = partial
      ? columns.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()) && c.toLowerCase() !== partial.toLowerCase()).map((c) => ({ value: c, kind: 'column' as const }))
      : [];
    const text = value.trim().toLowerCase();
    const suggestionOptions = suggestions
      .filter((s) => s.value !== value.trim() && (!text || s.value.toLowerCase().includes(text) || s.label?.toLowerCase().includes(text)))
      .map((s) => ({ ...s, kind: 'suggestion' as const }));
    return [...columnOptions, ...suggestionOptions].slice(0, MAX_OPTIONS);
  }, [value, suggestions, columns]);

  const open = focused && !dismissed && options.length > 0;
  // Stable, because the floating list re-measures whenever its dismiss callback changes.
  const close = useCallback(() => setDismissed(true), []);
  const current = Math.min(active, options.length - 1);

  const apply = (option: CompletionOption) => {
    if (option.kind === 'column') onChange(value.replace(PARTIAL_WORD, option.value));
    else onChange(option.value);
    setActive(0);
    setDismissed(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
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

  return {
    options,
    open,
    active: current,
    apply,
    setActive,
    onKeyDown,
    onFocus: () => {
      setFocused(true);
      setDismissed(false);
    },
    onBlur: () => setFocused(false),
    close,
    onInput: () => {
      setDismissed(false);
      setActive(0);
    },
  };
};

export default useExpressionCompletion;
