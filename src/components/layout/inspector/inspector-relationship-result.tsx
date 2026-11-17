import useT from '../../../hooks/ui/use-t';
import useDerived from '../../../hooks/data/use-derived';
import { fkColumnName } from '../../../domain/inference';
import { fkPrefix } from '../../../domain/model';
import { updateParticipant } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';

/**
 * The FKs this relationship produces, as they will appear in the DDL. The name of each FK column
 * can be typed; left empty it takes the automatic one, shown as placeholder.
 */
const InspectorRelationshipResult = ({ relationshipId }: { relationshipId: string }) => {
  const t = useT();
  const derived = useDerived();
  const project = useProjectStore((s) => s.project);
  const setHoveredFk = useUiStore((s) => s.setHoveredFk);
  if (!derived || !project) return null;
  const { schema } = derived;
  const relationship = project.relationships.find((r) => r.id === relationshipId);
  const fks = schema.foreignKeys.filter((fk) => fk.relationshipId === relationshipId);
  if (!relationship || fks.length === 0) return <p className="text-muted">{t('rel.noFks')}</p>;
  const table = (id: string) => schema.tables.find((x) => x.id === id);
  const column = (tableId: string, id: string) => table(tableId)?.columns.find((c) => c.id === id);

  return (
    <ul className="space-y-2">
      {fks.map((fk) => {
        const participant = relationship.participants.find((p) => p.id === fk.participantId);
        const nullable = column(fk.tableId, fk.columnIds[0])?.nullable;
        const prefix = participant ? fkPrefix(participant, project.entities, project.namesLocale) : '';
        const typed = participant?.fkColumnNames ?? [];
        const setName = (index: number, value: string) => {
          if (!participant) return;
          const names = fk.refColumnIds.map((_, i) => (i === index ? value : (typed[i] ?? '')));
          updateParticipant(relationshipId, participant.id, { fkColumnNames: names.some((n) => n.trim()) ? names : undefined }, `fk-col:${fk.id}:${index}`);
        };
        return (
          <li
            key={fk.id}
            onMouseEnter={() => setHoveredFk(fk.id)}
            onMouseLeave={() => setHoveredFk(null)}
            className="space-y-1.5 rounded-[calc(var(--radius)*0.75)] bg-surface-2 px-3 py-2 font-canvas text-[0.92em] leading-relaxed"
          >
            <div className="font-semibold">{fk.name}</div>
            <div className="space-y-1">
              {fk.refColumnIds.map((refId, index) => {
                const refName = column(fk.refTableId, refId)?.name ?? '?';
                const id = `fk-col-${fk.id}-${index}`;
                return (
                  <div key={refId} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="shrink-0">{table(fk.tableId)?.name}.</span>
                    <label htmlFor={id} className="sr-only">
                      {t('rel.fkColumn', { column: `${table(fk.refTableId)?.name}.${refName}` })}
                    </label>
                    <input
                      id={id}
                      className="field field-sm min-w-24 flex-1 font-canvas"
                      value={typed[index] ?? ''}
                      placeholder={fkColumnName(prefix, refName)}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) => setName(index, e.target.value)}
                    />
                    <span className="shrink-0">
                      {'->'} {table(fk.refTableId)?.name}.{refName}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="text-muted">{nullable ? t('rel.nullable') : 'NOT NULL'}</div>
          </li>
        );
      })}
    </ul>
  );
};

export default InspectorRelationshipResult;
