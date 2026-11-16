import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useExpressionCompletion, { type SuggestionSource } from '../../../hooks/ui/use-expression-completion';
import useMenuPosition from '../../../hooks/ui/use-menu-position';
import useT from '../../../hooks/ui/use-t';

type ExpressionInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Whole expressions that fit the column, or a function that continues the text before the cursor. */
  suggestions: SuggestionSource;
  /** Column names offered while typing a word. */
  columns: string[];
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /** A textarea for long expressions (several conditions joined with AND and OR). */
  multiline?: boolean;
};

/** SQL expression field (CHECK, WHERE) with suggestions and column name completion. */
const ExpressionInput = ({ id, value, onChange, suggestions, columns, placeholder, describedBy, invalid, multiline = false }: ExpressionInputProps) => {
  const t = useT();
  const { options, open, active, apply, setActive, onKeyDown, onCaret, nextCaret, onFocus, onBlur, onInput, close } = useExpressionCompletion(
    value,
    onChange,
    suggestions,
    columns,
    multiline,
  );
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  // After accepting an option the cursor goes right after the inserted text.
  useEffect(() => {
    if (nextCaret) inputRef.current?.setSelectionRange(nextCaret.position, nextCaret.position);
  }, [nextCaret]);
  const listId = `${id}-options`;
  const Field = multiline ? 'textarea' : 'input';
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Same floating placement as menus: below the field, or above it when there is no room.
  const position = useMenuPosition(open, fieldRef, listRef, 'start', close);

  return (
    <div ref={fieldRef} className="relative">
      <Field
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        rows={multiline ? 4 : undefined}
        className={`field field-sm font-canvas ${multiline ? 'resize-y leading-relaxed' : ''} ${open ? 'pr-12' : ''}`}
        value={value}
        placeholder={placeholder ?? (Array.isArray(suggestions) ? suggestions[0]?.value : undefined)}
        onChange={(e) => {
          onChange(e.target.value);
          onInput(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => onCaret(e.currentTarget.selectionStart ?? 0, e.currentTarget.selectionEnd ?? 0)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {open && (
        <kbd aria-hidden className="pointer-events-none absolute top-[1.05rem] right-2 -translate-y-1/2 rounded-[calc(var(--radius)*0.4)] border-(length:--bw) border-line px-1 font-sans text-[11px] text-muted">
          Tab
        </kbd>
      )}
      {open &&
        createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t('expr.suggestions')}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: fieldRef.current?.offsetWidth,
            maxHeight: Math.min(256, position?.maxHeight ?? 256),
            visibility: position ? 'visible' : 'hidden',
          }}
          className="fixed z-50 overflow-y-auto rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line bg-surface py-1 font-ui text-fg shadow-theme"
        >
          {options.map((option, i) => (
            <li
              key={`${option.kind}:${option.value}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown keeps the focus in the field, so the list does not close before the click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                apply(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-2.5 py-1.5 ${i === active ? 'bg-accent-soft' : ''}`}
            >
              <span className="min-w-0 truncate font-canvas text-[0.92em]">{option.display ?? option.value}</span>
              <span className="shrink-0 text-[0.85em] text-muted">{option.kind === 'column' ? t('expr.column') : option.label}</span>
            </li>
          ))}
        </ul>,
          document.body,
        )}
    </div>
  );
};

export default ExpressionInput;
