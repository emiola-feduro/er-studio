import Button from '../../ui/button/button';

type WorkspaceErrorProps = {
  message?: string;
  onRetry: () => void;
};

const WorkspaceError = ({ message, onRetry }: WorkspaceErrorProps) => {
  return (
    <main className="flex items-center justify-center p-8">
      <div role="alert" className="max-w-md rounded-theme border-(length:--bw) border-danger bg-danger-soft p-6 text-danger">
        <h2 className="text-[1.15em] font-semibold">No se pudo abrir el almacenamiento local</h2>
        <p className="mt-2">El navegador bloqueó IndexedDB o los datos del sitio. Revisa que no estés en una ventana privada.</p>
        {message && <p className="mt-2 font-canvas text-[0.9em]">{message}</p>}
        <Button className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </main>
  );
};

export default WorkspaceError;
