import { Check } from 'lucide-react';
import { forwardRef, type CSSProperties, type KeyboardEvent } from 'react';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above the item to start a new group. */
  separatorBefore?: boolean;
  /** Keyboard shortcut shown at the right. */
  hint?: string;
  /** Makes the item a checkbox. The menu stays open so several can be toggled. */
  checked?: boolean;
};

type MenuListProps = {
  items: MenuItem[];
  style: CSSProperties;
  /** Called after a regular item runs, and on Escape or Tab. */
  onClose: (reason: 'select' | 'dismiss') => void;
  label?: string;
};

/** Floating list of menu items with arrow key navigation. Positioning is up to the caller. */
const MenuList = forwardRef<HTMLUListElement, MenuListProps>(({ items, style, onClose, label }, ref) => {
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose('dismiss');
      return;
    }
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: (i + 1) % buttons.length,
      ArrowUp: (i - 1 + buttons.length) % buttons.length,
      Home: 0,
      End: buttons.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    buttons[moves[event.key]]?.focus();
  };

  return (
    <ul
      ref={ref}
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={onKeyDown}
      className="fixed z-50 min-w-48 overflow-y-auto rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line bg-surface py-1 font-ui text-fg shadow-theme"
    >
      {items.map(({ label: text, onSelect, danger, disabled, separatorBefore, hint, checked }) => (
        <li key={text} role="none" className={separatorBefore ? 'mt-1 border-t border-line pt-1' : undefined}>
          <button
            type="button"
            role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={checked}
            disabled={disabled}
            onClick={() => {
              onSelect();
              if (checked === undefined) onClose('select');
            }}
            className={`flex w-full items-center justify-between gap-6 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50 ${danger ? 'text-danger' : ''}`}
          >
            <span className="flex items-center gap-2">
              {checked !== undefined && (
                <span className="inline-flex w-4 justify-center" aria-hidden>
                  {checked && <Check size={15} />}
                </span>
              )}
              {text}
            </span>
            {hint && <kbd className="font-sans text-[0.85em] text-muted">{hint}</kbd>}
          </button>
        </li>
      ))}
    </ul>
  );
});

MenuList.displayName = 'MenuList';

export default MenuList;
