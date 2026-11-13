import useT from '../../../hooks/ui/use-t';
import useProjectBootstrap from '../../../hooks/data/use-project-bootstrap';
import Button from '../../ui/button/button';

const ProjectListError = () => {
  const t = useT();
  const { error, retry } = useProjectBootstrap();
  return (
    <div role="alert" className="mx-2 rounded-theme bg-danger-soft p-3 text-danger">
      <p>{t('projects.loadError')}</p>
      {error && <p className="mt-1 text-[0.9em]">{error}</p>}
      <Button size="sm" className="mt-2" onClick={retry}>
        {t('common.retry')}
      </Button>
    </div>
  );
};

export default ProjectListError;
