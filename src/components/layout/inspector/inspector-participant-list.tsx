import type { Relationship } from '../../../domain/types';
import { addParticipant } from '../../../lib/actions';
import useRegularEntities from '../../../hooks/model/use-regular-entities';
import InspectorParticipant from './inspector-participant';

const InspectorParticipantList = ({ relationship }: { relationship: Relationship }) => {
  const { id, participants } = relationship;
  const entities = useRegularEntities();

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {participants.map((participant) => (
          <InspectorParticipant
            key={participant.id}
            relationshipId={id}
            participant={participant}
            entities={entities}
            canRemove={participants.length > 2}
          />
        ))}
      </ul>
      <label htmlFor={`rel-add-${id}`} className="sr-only">
        Añadir participante
      </label>
      <select
        id={`rel-add-${id}`}
        className="field field-sm"
        value=""
        onChange={(e) => e.target.value && addParticipant(id, e.target.value)}
      >
        <option value="">{participants.length === 2 ? 'Añadir participante (convertir en ternaria)' : 'Añadir participante'}</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default InspectorParticipantList;
