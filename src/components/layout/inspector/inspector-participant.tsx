import { Trash2 } from 'lucide-react';
import type { Cardinality, Entity, Participant } from '../../../domain/types';
import { removeParticipant, updateParticipant } from '../../../lib/actions';
import Checkbox from '../../ui/checkbox/checkbox';
import IconButton from '../../ui/icon-button/icon-button';
import SegmentedControl from '../../ui/segmented-control/segmented-control';

type InspectorParticipantProps = {
  relationshipId: string;
  participant: Participant;
  entities: Entity[];
  canRemove: boolean;
};

const InspectorParticipant = ({ relationshipId, participant, entities, canRemove }: InspectorParticipantProps) => {
  const { id, entityId, role, cardinality, optional, constraintName } = participant;
  const update = (patch: Partial<Participant>, key?: string) => updateParticipant(relationshipId, id, patch, key);

  return (
    <li className="space-y-2.5 rounded-theme border-(length:--bw) border-line p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={`p-entity-${id}`} className="sr-only">
          Entidad
        </label>
        <select id={`p-entity-${id}`} className="field field-sm flex-1 font-semibold" value={entityId} onChange={(e) => update({ entityId: e.target.value })}>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {canRemove && (
          <IconButton label="Quitar participante" tone="danger" size="sm" onClick={() => removeParticipant(relationshipId, id)}>
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl<Cardinality>
          label="Cardinalidad"
          size="sm"
          value={cardinality}
          onChange={(v) => update({ cardinality: v })}
          options={[
            { value: '1', label: 'Uno' },
            { value: 'N', label: 'Muchos' },
          ]}
        />
        <Checkbox label="Opcional" checked={optional} onChange={(v) => update({ optional: v })} title="Mínimo cero: la FK hacia esta entidad admite NULL" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`p-role-${id}`} className="block text-[0.9em] text-muted">
            Rol
          </label>
          <input
            id={`p-role-${id}`}
            className="field field-sm"
            placeholder="jefe, seguidor"
            value={role ?? ''}
            onChange={(e) => update({ role: e.target.value || undefined }, `p-role:${id}`)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`p-fk-${id}`} className="block text-[0.9em] text-muted">
            Nombre de la FK
          </label>
          <input
            id={`p-fk-${id}`}
            className="field field-sm font-canvas"
            placeholder="automático"
            value={constraintName ?? ''}
            onChange={(e) => update({ constraintName: e.target.value || undefined }, `p-fk:${id}`)}
          />
        </div>
      </div>
    </li>
  );
};

export default InspectorParticipant;
