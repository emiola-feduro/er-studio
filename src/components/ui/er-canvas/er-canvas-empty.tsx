import useT from '../../../hooks/ui/use-t';
import { addEntity } from '../../../lib/actions';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';

const ErCanvasEmpty = () => {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-theme border-(length:--bw) border-line bg-surface p-6 text-center shadow-theme">
        <h2 className="text-[1.2em] font-semibold">{t('canvas.emptyTitle')}</h2>
        <p className="mt-2 text-muted">{t('canvas.emptyText')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => addEntity({ x: 0, y: 0 })}>
            {t('canvas.newEntity')}
          </Button>
          <Button onClick={() => useUiStore.getState().setNewProjectOpen(true, 'random')}>{t('canvas.randomProject')}</Button>
        </div>
      </div>
    </div>
  );
};

export default ErCanvasEmpty;
