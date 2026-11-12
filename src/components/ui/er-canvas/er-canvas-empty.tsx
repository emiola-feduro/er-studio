import { addEntity } from '../../../lib/actions';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';

const ErCanvasEmpty = () => {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-theme border-(length:--bw) border-line bg-surface p-6 text-center shadow-theme">
        <h2 className="text-[1.2em] font-semibold">Diagrama vacío</h2>
        <p className="mt-2 text-muted">Crea tu primera entidad. Luego arrastra el punto de su borde derecho hasta otra para relacionarlas.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => addEntity({ x: 0, y: 0 })}>
            Nueva entidad
          </Button>
          <Button onClick={() => useUiStore.getState().setNewProjectOpen(true, 'random')}>Proyecto con modelo aleatorio</Button>
        </div>
      </div>
    </div>
  );
};

export default ErCanvasEmpty;
