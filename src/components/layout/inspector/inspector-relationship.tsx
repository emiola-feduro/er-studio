import { isRecursive, needsJunction, relationshipKind } from '../../../domain/model';
import type { Relationship } from '../../../domain/types';
import useDerived from '../../../hooks/data/use-derived';
import { deleteRelationship, swapParticipants, updateRelationship } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import Button from '../../ui/button/button';
import Checkbox from '../../ui/checkbox/checkbox';
import InspectorIssueList from './inspector-issue-list';
import InspectorParticipantList from './inspector-participant-list';
import InspectorReferentialActions from './inspector-referential-actions';
import InspectorRelationshipResult from './inspector-relationship-result';
import InspectorSection from './inspector-section';

const kindTitles = { binaria: 'Relación binaria', recursiva: 'Relación recursiva', ternaria: 'Relación ternaria', 'n-aria': 'Relación n-aria' };

const InspectorRelationship = ({ relationship }: { relationship: Relationship }) => {
  const { id, name, identifying, participants, junctionId } = relationship;
  const derived = useDerived();
  const junction = useProjectStore((s) => s.project?.entities.find((e) => e.id === junctionId));
  const select = useUiStore((s) => s.select);
  const issues = derived?.issues.filter((i) => i.relationshipId === id) ?? [];
  const withJunction = needsJunction(relationship);
  const canBeIdentifying = !withJunction && !isRecursive(relationship);

  return (
    <>
      <div className="space-y-3 border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1.15em] font-semibold">{kindTitles[relationshipKind(relationship)]}</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="danger" onClick={() => deleteRelationship(id)}>
              Eliminar
            </Button>
            <PanelHideButton panel="inspector" label="resumen e inspector" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`rel-name-${id}`} className="block font-medium">
            Nombre (opcional)
          </label>
          <input
            id={`rel-name-${id}`}
            className="field"
            placeholder="compra, inscribe, supervisa"
            value={name ?? ''}
            onChange={(e) => updateRelationship(id, { name: e.target.value || undefined }, `rel-name:${id}`)}
          />
        </div>
        {junction && (
          <p>
            Tabla intermedia:{' '}
            <button type="button" className="font-semibold text-accent underline underline-offset-2" onClick={() => select({ kind: 'entity', id: junction.id })}>
              {junction.name}
            </button>
          </p>
        )}
      </div>
      <InspectorSection
        title="Participantes"
        action={
          participants.length === 2 && (
            <Button size="sm" variant="ghost" onClick={() => swapParticipants(id)}>
              Intercambiar
            </Button>
          )
        }
      >
        <InspectorParticipantList relationship={relationship} />
      </InspectorSection>
      <InspectorSection title="Llaves foráneas generadas">
        <InspectorRelationshipResult relationshipId={id} />
        {canBeIdentifying && (
          <div className="mt-3">
            <Checkbox
              label="Identificadora (la FK forma parte de la PK)"
              checked={identifying}
              onChange={(v) => updateRelationship(id, { identifying: v })}
            />
          </div>
        )}
      </InspectorSection>
      <InspectorSection title="Acciones referenciales">
        <InspectorReferentialActions relationship={relationship} />
      </InspectorSection>
      {issues.length > 0 && (
        <InspectorSection title={`Avisos (${issues.length})`}>
          <InspectorIssueList issues={issues} />
        </InspectorSection>
      )}
    </>
  );
};

export default InspectorRelationship;
