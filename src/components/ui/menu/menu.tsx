import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import useMenuPosition from '../../../hooks/ui/use-menu-position';
import MenuList, { type MenuItem } from './menu-list';

export type { MenuItem };

type MenuProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
};

/**
 * Dropdown menu with keyboard support (arrows, Escape). The list is rendered in a portal
 * with fixed positioning so containers with overflow never cut it off.
 */
const Menu = ({ trigger, items, align = 'end' }: MenuProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const position = useMenuPosition(open, rootRef, listRef, align, close);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (position) listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [position]);

  const onClose = (reason: 'select' | 'dismiss') => {
    setOpen(false);
    if (reason === 'dismiss') rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <MenuList
            ref={listRef}
            items={items}
            onClose={onClose}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              maxHeight: position?.maxHeight,
              visibility: position ? 'visible' : 'hidden',
            }}
          />,
          document.body,
        )}
    </div>
  );
};

export default Menu;
