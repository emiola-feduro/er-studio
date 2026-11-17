import { X } from 'lucide-react';
import type { Entity, Specialization } from '../../../domain/types';
import useT from '../../../hooks/ui/use-t';
import { addSubtype, removeSubtype } from '../../../lib/specialization-actions';
import useUiStore from '../../../stores/use-ui-store';
import IconButton from '../../ui/icon-button/icon-button';

type InspectorSpecializationSubtypesProps = {
  spec: Specialization;
  entities: Entity[];
};

/** The subclasses, each a link to its table, and a list to add another regular entity. */
const InspectorSpecializationSubtypes = ({ spec, entities }: InspectorSpecializationSubtypesProps) => {
  const t = useT();
  const select = useUiStore((s) => s.select);
  const subtypes = spec.subtypeIds.map((id) => entities.find((e) => e.id === id)).filter((e): e is Entity => Boolean(e));
  const candidates = entities.filter((e) => e.kind === 'entity' && e.id !== spec.supertypeId && !spec.subtypeIds.includes(e.id));

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {subtypes.map((sub) => (
          <li key={sub.id} className="flex items-center justify-between gap-2 rounded-[calc(var(--radius)*0.75)] bg-surface-2 py-1 pr-1 pl-3">
            <button type="button" className="min-w-0 truncate font-medium text-accent underline-offset-2 hover:underline" onClick={() => select({ kind: 'entity', id: sub.id })}>
              {sub.name}
            </button>
            <IconButton label={t('spec.removeSubtype', { name: sub.name })} size="sm" onClick={() => removeSubtype(spec.id, sub.id)}>
              <X size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <select
          aria-label={t('spec.addSubtype')}
          className="field field-sm"
          value=""
          onChange={(e) => e.target.value && addSubtype(spec.id, e.target.value)}
        >
          <option value="">{t('spec.addSubtype')}</option>
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default InspectorSpecializationSubtypes;
