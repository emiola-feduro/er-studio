import useT from '../../../hooks/ui/use-t';
const ProjectListSkeleton = () => {
  const t = useT();
  return (
    <ul aria-busy="true" aria-label={t('projects.loading')} className="space-y-2 px-2">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-10 animate-pulse rounded-[calc(var(--radius)*0.75)] bg-surface-2" />
      ))}
    </ul>
  );
};

export default ProjectListSkeleton;
