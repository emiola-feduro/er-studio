import { DIALECTS } from '../../../domain/dialects';
import type { ReferentialAction, Relationship } from '../../../domain/types';
import { updateRelationship } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const InspectorReferentialActions = ({ relationship }: { relationship: Relationship }) => {
  const dialect = DIALECTS[useProjectStore((s) => s.project?.dialect ?? 'postgresql')];
  const { id, onDelete, onUpdate } = relationship;
  const fields = [
    { key: 'onDelete', label: 'Al eliminar (ON DELETE)', value: onDelete, enabled: true },
    { key: 'onUpdate', label: 'Al actualizar (ON UPDATE)', value: onUpdate, enabled: dialect.supportsOnUpdate },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, label, value, enabled }) => (
        <div key={key} className="space-y-1">
          <label htmlFor={`${key}-${id}`} className="block text-[0.9em] text-muted">
            {label}
          </label>
          <select
            id={`${key}-${id}`}
            className="field field-sm"
            value={value}
            disabled={!enabled}
            onChange={(e) => updateRelationship(id, { [key]: e.target.value as ReferentialAction })}
          >
            {dialect.referentialActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {!enabled && <p className="text-[0.86em] text-muted">{dialect.name} no lo soporta</p>}
        </div>
      ))}
    </div>
  );
};

export default InspectorReferentialActions;
