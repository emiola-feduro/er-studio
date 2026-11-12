import useDerived from '../../../hooks/data/use-derived';
import useUiStore from '../../../stores/use-ui-store';

/** Lists the FKs this relationship produces, as they will appear in the DDL. */
const InspectorRelationshipResult = ({ relationshipId }: { relationshipId: string }) => {
  const derived = useDerived();
  const setHoveredFk = useUiStore((s) => s.setHoveredFk);
  if (!derived) return null;
  const { schema } = derived;
  const fks = schema.foreignKeys.filter((fk) => fk.relationshipId === relationshipId);
  if (fks.length === 0) return <p className="text-muted">Esta relación todavía no genera llaves foráneas.</p>;
  const table = (id: string) => schema.tables.find((t) => t.id === id);
  const cols = (tableId: string, ids: string[]) => ids.map((id) => table(tableId)?.columns.find((c) => c.id === id)?.name ?? '?').join(', ');

  return (
    <ul className="space-y-2">
      {fks.map((fk) => {
        const nullable = table(fk.tableId)?.columns.find((c) => c.id === fk.columnIds[0])?.nullable;
        return (
          <li
            key={fk.id}
            onMouseEnter={() => setHoveredFk(fk.id)}
            onMouseLeave={() => setHoveredFk(null)}
            className="rounded-[calc(var(--radius)*0.75)] bg-surface-2 px-3 py-2 font-canvas text-[0.92em] leading-relaxed"
          >
            <div className="font-semibold">{fk.name}</div>
            <div>
              {table(fk.tableId)?.name}({cols(fk.tableId, fk.columnIds)}) {'->'} {table(fk.refTableId)?.name}({cols(fk.refTableId, fk.refColumnIds)})
            </div>
            <div className="text-muted">{nullable ? 'Admite NULL' : 'NOT NULL'}</div>
          </li>
        );
      })}
    </ul>
  );
};

export default InspectorRelationshipResult;
