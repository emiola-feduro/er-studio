import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MenuList, { type MenuItem } from '../menu/menu-list';

type ContextMenuProps = {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
};

const MARGIN = 8;

/** Menu opened at the pointer. It stays inside the window and closes on outside click, scroll or resize. */
const ContextMenu = ({ x, y, label, items, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const width = menu.offsetWidth;
    const height = menu.scrollHeight;
    const maxHeight = window.innerHeight - MARGIN * 2;
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - Math.min(height, maxHeight) - MARGIN)),
      maxHeight,
    });
  }, [x, y]);

  useEffect(() => {
    if (position) ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [position]);

  useEffect(() => {
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('wheel', outside, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('wheel', outside, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <MenuList
      ref={ref}
      label={label}
      items={items}
      onClose={onClose}
      style={{
        top: position?.top ?? y,
        left: position?.left ?? x,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
    />,
    document.body,
  );
};

export default ContextMenu;
