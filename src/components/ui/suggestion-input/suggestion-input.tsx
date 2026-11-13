import type { InputHTMLAttributes, KeyboardEvent } from 'react';

type SuggestionInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  /** Name the app would use; shown as the placeholder and taken with Tab. */
  suggestion?: string;
  onChange: (value: string) => void;
};

/**
 * Text field that shows a suggested value and fills it in when Tab is pressed on an empty field.
 * With a value already typed, Tab moves focus as usual.
 */
const SuggestionInput = ({ value, suggestion, placeholder, onChange, onKeyDown, className = '', ...rest }: SuggestionInputProps) => {
  const canComplete = Boolean(suggestion) && value === '';

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Tab' || event.shiftKey || !canComplete) return;
    event.preventDefault();
    onChange(suggestion!);
  };

  return (
    <span className="relative block">
      <input
        {...rest}
        value={value}
        placeholder={suggestion ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`peer ${canComplete ? 'pr-12' : ''} ${className}`}
      />
      {canComplete && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-[calc(var(--radius)*0.4)] border-(length:--bw) border-line px-1 font-sans text-[11px] text-muted peer-focus:inline"
        >
          Tab
        </kbd>
      )}
    </span>
  );
};

export default SuggestionInput;
