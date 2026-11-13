import { Trash2 } from 'lucide-react';
import type { Cardinality, Entity, Participant } from '../../../domain/types';
import { removeParticipant, updateParticipant } from '../../../lib/actions';
import Checkbox from '../../ui/checkbox/checkbox';
import useDerived from '../../../hooks/data/use-derived';
import IconButton from '../../ui/icon-button/icon-button';
import SuggestionInput from '../../ui/suggestion-input/suggestion-input';
import SegmentedControl from '../../ui/segmented-control/segmented-control';

type InspectorParticipantProps = {
  relationshipId: string;
  participant: Participant;
  entities: Entity[];
  canRemove: boolean;
};

const InspectorParticipant = ({ relationshipId, participant, entities, canRemove }: InspectorParticipantProps) => {
  const { id, entityId, role, cardinality, optional, constraintName, refAttributeId } = participant;
  const update = (patch: Partial<Participant>, key?: string) => updateParticipant(relationshipId, id, patch, key);
  const derived = useDerived();
  // Name the FK gets when none is typed; only participants whose key is referenced have one.
  const fk = derived?.schema.foreignKeys.find((f) => f.relationshipId === relationshipId && f.participantId === id);
  const generatedFkName = constraintName ? undefined : fk?.name;
  // A FK can point to the primary key or to any UNIQUE attribute of the referenced entity.
  const entity = entities.find((e) => e.id === entityId);
  const keyCount = entity?.attributes.filter((a) => a.pk).length ?? 0;
  const uniqueTargets = entity?.attributes.filter((a) => a.unique && !(a.pk && keyCount === 1)) ?? [];
  const showTarget = Boolean(fk) && (uniqueTargets.length > 0 || Boolean(refAttributeId));

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
      {showTarget && (
        <div className="space-y-1">
          <label htmlFor={`p-ref-${id}`} className="block text-[0.9em] text-muted">
            Columna referenciada
          </label>
          <select
            id={`p-ref-${id}`}
            className="field field-sm font-canvas"
            value={refAttributeId ?? ''}
            onChange={(e) => update({ refAttributeId: e.target.value || undefined })}
          >
            <option value="">Llave primaria</option>
            {entity?.attributes
              .filter((a) => uniqueTargets.includes(a) || a.id === refAttributeId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      )}
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
          <SuggestionInput
            id={`p-fk-${id}`}
            className="field field-sm font-canvas"
            suggestion={generatedFkName}
            placeholder="automático"
            value={constraintName ?? ''}
            onChange={(value) => update({ constraintName: value || undefined }, `p-fk:${id}`)}
          />
        </div>
      </div>
    </li>
  );
};

export default InspectorParticipant;
