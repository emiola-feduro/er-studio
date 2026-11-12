import { X } from 'lucide-react';
import useUiStore from '../../../stores/use-ui-store';
import IconButton from '../icon-button/icon-button';

const ToastStack = () => {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(26rem,calc(100%-2rem))] flex-col gap-2">
      {toasts.map(({ id, message, tone }) => (
        <div
          key={id}
          role={tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded-theme border-(length:--bw) px-4 py-3 shadow-theme ${tone === 'error' ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-surface text-fg'}`}
        >
          <p className="flex-1 leading-snug">{message}</p>
          <IconButton label="Cerrar aviso" size="sm" onClick={() => dismiss(id)}>
            <X size={16} />
          </IconButton>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
