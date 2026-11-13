import KeyMarkers from '../../ui/constraint-icons/key-markers';
import useT from '../../../hooks/ui/use-t';
import { displayType } from '../../../domain/dialects';
import type { Table } from '../../../domain/types';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import InspectorSection from './inspector-section';

/** Columns that come from relationships. They are read-only here and edited through the relationship. */
const InspectorFkColumns = ({ table }: { table: Table }) => {
  const t = useT();
  const dialect = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const select = useUiStore((s) => s.select);
  const setHoveredFk = useUiStore((s) => s.setHoveredFk);
  const { columns, foreignKeys } = table;
  const fkColumns = columns.filter((c) => c.origin === 'fk');
  if (fkColumns.length === 0) return null;

  return (
    <InspectorSection title={t('entity.fkColumns')}>
      <ul className="space-y-1">
        {fkColumns.map((col) => {
          const fk = foreignKeys.find((f) => f.id === col.fkId);
          return (
            <li key={col.id}>
              <button
                type="button"
                onClick={() => fk && select({ kind: 'relationship', id: fk.relationshipId })}
                onMouseEnter={() => setHoveredFk(col.fkId ?? null)}
                onMouseLeave={() => setHoveredFk(null)}
                className="flex w-full items-baseline gap-2 rounded-[calc(var(--radius)*0.75)] px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="flex w-10 shrink-0 self-center">
                  <KeyMarkers pk={col.pk} fk size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
                <span className="text-muted">{displayType(dialect, col)}</span>
                <span className="text-[0.86em] text-muted">{col.nullable ? 'NULL' : 'NN'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </InspectorSection>
  );
};

export default InspectorFkColumns;
