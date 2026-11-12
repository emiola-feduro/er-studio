import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';

const WorkspaceEmpty = () => {
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  return (
    <main className="flex items-center justify-center bg-canvas p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-[1.2em] font-semibold">No hay ningún proyecto abierto</h2>
        <Button variant="primary" className="mt-4" onClick={() => setNewProjectOpen(true)}>
          Crear proyecto
        </Button>
      </div>
    </main>
  );
};

export default WorkspaceEmpty;
