import useT from '../../../hooks/ui/use-t';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';

const WorkspaceEmpty = () => {
  const t = useT();
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  return (
    <main className="flex items-center justify-center bg-canvas p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-[1.2em] font-semibold">{t('workspace.noProject')}</h2>
        <Button variant="primary" className="mt-4" onClick={() => setNewProjectOpen(true)}>
          {t('workspace.createProject')}
        </Button>
      </div>
    </main>
  );
};

export default WorkspaceEmpty;
