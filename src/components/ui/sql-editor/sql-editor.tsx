import { useMemo, useRef } from 'react';
import { TOKEN_CLASS, tokenizeSql } from '../../../lib/sql-highlight';

type SqlEditorProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

// Same box for the text area and the colored copy under it, so the letters line up.
const BOX = 'p-4 font-sql text-[13px] leading-relaxed whitespace-pre [tab-size:2]';

/**
 * SQL text area with syntax highlighting: the typed text is transparent and a colored copy sits
 * underneath, scrolled together. The caret, selection and keyboard are the browser's own.
 */
const SqlEditor = ({ id, label, value, onChange, placeholder }: SqlEditorProps) => {
  const backdropRef = useRef<HTMLPreElement>(null);
  const tokens = useMemo(() => tokenizeSql(value), [value]);

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
        id={id}
        aria-label={label}
        className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-fg outline-none selection:bg-accent/25 placeholder:text-muted ${BOX}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          const backdrop = backdropRef.current;
          if (!backdrop) return;
          backdrop.scrollTop = e.currentTarget.scrollTop;
          backdrop.scrollLeft = e.currentTarget.scrollLeft;
        }}
      />
    </div>
  );
};

export default SqlEditor;
