import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import useSqlCompletion, { type CompletionSource } from '../../../hooks/ui/use-sql-completion';
import useT from '../../../hooks/ui/use-t';
import { TOKEN_CLASS, tokenizeSql } from '../../../lib/sql-highlight';

type SqlEditorProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** What fits at the cursor; without it the editor has no autocomplete. */
  complete?: CompletionSource;
};

// Same box for the text area and the colored copy under it, so the letters line up.
const BOX = 'p-4 font-sql text-[13px] leading-relaxed whitespace-pre [tab-size:2]';

/**
 * SQL text area with syntax highlighting and autocomplete: the typed text is transparent and a
 * colored copy sits underneath, scrolled together. The caret, selection and keyboard are the
 * browser's own; the suggestions float under the caret.
 */
const SqlEditor = ({ id = 'sql-editor', label, value, onChange, placeholder, complete }: SqlEditorProps) => {
  const t = useT();
  const backdropRef = useRef<HTMLPreElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tokens = useMemo(() => tokenizeSql(value), [value]);
  const completion = useSqlCompletion(areaRef, listRef, value, onChange, complete);
  const listId = `${id}-suggestions`;

  return (
    <div className="relative h-full min-h-56 overflow-hidden bg-bg focus-within:ring-2 focus-within:ring-accent focus-within:ring-inset">
      <pre ref={backdropRef} aria-hidden className={`pointer-events-none absolute inset-0 m-0 overflow-hidden ${BOX}`}>
        <code className="font-[inherit]">
          {tokens.map((token, index) => (
            <span key={index} className={TOKEN_CLASS[token.kind]}>
              {token.text}
            </span>
          ))}
          {/* A trailing line break needs a character after it to take up a line. */}
          {'\n '}
        </code>
      </pre>
      <textarea
        ref={areaRef}
        id={id}
        aria-label={label}
        role={complete ? 'combobox' : undefined}
        aria-autocomplete={complete ? 'list' : undefined}
        aria-expanded={complete ? completion.open : undefined}
        aria-controls={complete ? listId : undefined}
        aria-activedescendant={completion.open ? `${listId}-${completion.active}` : undefined}
        className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-fg outline-none selection:bg-accent/25 placeholder:text-muted ${BOX}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
        onChange={(e) => {
          const native = e.nativeEvent as InputEvent;
          onChange(e.target.value);
          completion.onInput(e.target.value, e.target.selectionStart, Boolean(native.inputType?.startsWith('insert')));
        }}
        onKeyDown={completion.onKeyDown}
        onBlur={completion.close}
        onClick={completion.close}
        onScroll={(e) => {
          const backdrop = backdropRef.current;
          if (backdrop) {
            backdrop.scrollTop = e.currentTarget.scrollTop;
            backdrop.scrollLeft = e.currentTarget.scrollLeft;
          }
          if (completion.open) completion.onScroll();
        }}
      />
      {completion.open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t('expr.suggestions')}
            style={{
              top: completion.position?.top ?? 0,
              left: completion.position?.left ?? 0,
              maxHeight: completion.position?.maxHeight ?? 280,
              visibility: completion.position ? 'visible' : 'hidden',
            }}
            className="fixed z-50 max-w-[min(32rem,calc(100vw-1rem))] min-w-56 overflow-y-auto rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line bg-surface py-1 font-ui text-fg shadow-theme"
          >
            {completion.items.map((item, i) => (
              <li
                key={`${item.label}-${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === completion.active}
                // mousedown keeps the focus in the editor, so the list does not close before the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  completion.accept(i);
                }}
                onMouseEnter={() => completion.setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-4 px-2.5 py-1 ${i === completion.active ? 'bg-accent-soft' : ''}`}
              >
                <span className="min-w-0 truncate font-sql text-[0.92em]">{item.label}</span>
                {item.detail && <span className="shrink-0 text-[0.82em] text-muted">{item.detail}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
};

export default SqlEditor;
