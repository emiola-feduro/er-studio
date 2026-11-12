import { useLayoutEffect, useState, type RefObject } from 'react';

type MenuPosition = { top: number; left: number; maxHeight: number } | null;

const GAP = 4;
const MARGIN = 8;

/**
 * Fixed position for a floating menu next to its trigger. It opens downward and flips upward
 * when there is not enough room, so scrolling containers never clip it.
 */
const useMenuPosition = (
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  align: 'start' | 'end',
  onDismiss: () => void,
): MenuPosition => {
  const [position, setPosition] = useState<MenuPosition>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const width = menu.offsetWidth;
      const height = menu.scrollHeight;
      const below = window.innerHeight - trigger.bottom - GAP - MARGIN;
      const above = trigger.top - GAP - MARGIN;
      const openUp = height > below && above > below;
      const maxHeight = Math.max(120, openUp ? above : below);
      const top = openUp ? Math.max(MARGIN, trigger.top - GAP - Math.min(height, maxHeight)) : trigger.bottom + GAP;
      const preferred = align === 'end' ? trigger.right - width : trigger.left;
      const left = Math.min(Math.max(MARGIN, preferred), window.innerWidth - width - MARGIN);
      setPosition({ top, left, maxHeight });
    };
    update();
    // Scrolling or resizing would detach the menu from its trigger, so it closes instead.
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onDismiss();
    };
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, triggerRef, menuRef, align, onDismiss]);

  return position;
};

export default useMenuPosition;
