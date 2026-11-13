import useT from '../../../hooks/ui/use-t';
const WorkspaceSkeleton = () => {
  const t = useT();
  return (
    <main aria-busy="true" aria-label={t('workspace.loading')} className="relative min-h-0 bg-canvas p-8">
      <div className="flex gap-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 w-64 animate-pulse rounded-theme bg-surface-2" />
        ))}
      </div>
    </main>
  );
};

export default WorkspaceSkeleton;
