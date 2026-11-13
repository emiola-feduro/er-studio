import useT from '../../../hooks/ui/use-t';
import type { Issue } from '../../../domain/types';
import useUiStore from '../../../stores/use-ui-store';
import Pill from '../../ui/pill/pill';

const InspectorIssueList = ({ issues }: { issues: Issue[] }) => {
  const t = useT();
  const select = useUiStore((s) => s.select);
  if (issues.length === 0) return <p className="text-success">{t('common.noWarnings')}</p>;

  return (
    <ul className="space-y-2">
      {issues.map(({ level, message, entityId, relationshipId }, i) => {
        const target = entityId
          ? ({ kind: 'entity', id: entityId } as const)
          : relationshipId
            ? ({ kind: 'relationship', id: relationshipId } as const)
            : null;
        const content = (
          <>
            <Pill tone={level === 'error' ? 'danger' : 'warning'}>{level === 'error' ? t('common.error') : t('common.warning')}</Pill>
            <span className="flex-1 leading-snug">{message}</span>
          </>
        );
        return (
          <li key={`${message}-${i}`}>
            {target ? (
              <button
                type="button"
                onClick={() => select(target)}
                className="flex w-full items-start gap-2 rounded-[calc(var(--radius)*0.75)] p-1.5 text-left hover:bg-surface-2"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-2 p-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default InspectorIssueList;
