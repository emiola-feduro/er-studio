import { useCallback, useEffect, useRef, useState, type PointerEvent, type SyntheticEvent } from 'react';

const GRACE_MS = 300;

/**
 * Open state for a disclosure that closes by itself when the mouse leaves it.
 * A short grace period lets the pointer cross the border without closing it; touch is ignored
 * because a finger "leaves" on every tap.
 */
const useHoverDismiss = <T extends HTMLDetailsElement>() => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => cancel, [cancel]);

  const onToggle = useCallback((event: SyntheticEvent<T>) => setOpen(event.currentTarget.open), []);

  const onPointerLeave = useCallback(
    (event: PointerEvent<T>) => {
      if (event.pointerType !== 'mouse' || !open) return;
      cancel();
      timer.current = setTimeout(() => setOpen(false), GRACE_MS);
    },
    [open, cancel],
  );

  return { open, onToggle, onPointerLeave, onPointerEnter: cancel };
};

export default useHoverDismiss;
