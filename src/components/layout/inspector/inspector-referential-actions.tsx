import useT from '../../../hooks/ui/use-t';
import { DIALECTS } from '../../../domain/dialects';
import type { ReferentialAction, Relationship } from '../../../domain/types';
import { updateRelationship } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const InspectorReferentialActions = ({ relationship }: { relationship: Relationship }) => {
  const t = useT();
  const dialect = DIALECTS[useProjectStore((s) => s.project?.dialect ?? 'postgresql')];
  const { id, onDelete, onUpdate } = relationship;
  const fields = [
    { key: 'onDelete', label: t('rel.onDelete'), value: onDelete, enabled: true },
    { key: 'onUpdate', label: t('rel.onUpdate'), value: onUpdate, enabled: dialect.supportsOnUpdate },
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
          {!enabled && <p className="text-[0.86em] text-muted">{t('rel.notSupported', { dialect: dialect.name })}</p>}
        </div>
      ))}
    </div>
  );
};

export default InspectorReferentialActions;
