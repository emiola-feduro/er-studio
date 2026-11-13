import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import IconButton from '../icon-button/icon-button';

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
};

/** Native dialog: focus trapping, Escape and backdrop come from the browser. */
const Modal = ({ title, open, onClose, children, footer, width = 'max-w-lg' }: ModalProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-theme border-(length:--bw) border-line bg-surface p-0 text-fg shadow-theme backdrop:bg-black/40 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
            <h2 className="text-[1.15em] font-semibold">{title}</h2>
            <IconButton label="Cerrar" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
};

export default Modal;
