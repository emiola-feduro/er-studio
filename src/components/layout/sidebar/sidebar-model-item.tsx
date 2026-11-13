import useT from '../../../hooks/ui/use-t';
type SidebarModelItemProps = {
  label: string;
  meta: string;
  issues: number;
  active: boolean;
  onSelect: () => void;
};

const SidebarModelItem = ({ label, meta, issues, active, onSelect }: SidebarModelItemProps) => {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-[calc(var(--radius)*0.75)] px-2 py-1.5 text-left transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          <span className="block truncate text-[0.86em] text-muted">{meta}</span>
        </span>
        {issues > 0 && (
          <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-[0.8em] font-semibold text-danger" title={t('common.warningsCount', { count: issues })}>
            {issues}
          </span>
        )}
      </button>
    </li>
  );
};

export default SidebarModelItem;
