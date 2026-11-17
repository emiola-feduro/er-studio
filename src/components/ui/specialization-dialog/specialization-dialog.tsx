import { useEffect, useState } from 'react';
import type { SpecializationMapping } from '../../../domain/types';
import useT from '../../../hooks/ui/use-t';
import type { MessageKey } from '../../../i18n';
import { createSpecialization } from '../../../lib/specialization-actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';

const MAPPINGS: SpecializationMapping[] = ['table-per-type', 'single-table', 'table-per-concrete'];

/** New specialization: a superclass, its subclasses among the existing entities, and its rules. */
const SpecializationDialog = () => {
  const t = useT();
  const { open, supertypeId: initialSuper, subtypeIds: initialSubs } = useUiStore((s) => s.specializationDialog);
  const close = useUiStore((s) => s.closeSpecializationDialog);
  const project = useProjectStore((s) => s.project);
  const entities = (project?.entities ?? []).filter((e) => e.kind === 'entity');
  const [supertypeId, setSupertypeId] = useState('');
  const [subtypeIds, setSubtypeIds] = useState<string[]>([]);
  const [total, setTotal] = useState(false);
  const [disjoint, setDisjoint] = useState(true);
  const [mapping, setMapping] = useState<SpecializationMapping>('table-per-type');

  useEffect(() => {
    if (!open) return;
    setSupertypeId(initialSuper ?? entities[0]?.id ?? '');
    setSubtypeIds(initialSubs);
    setTotal(false);
    setDisjoint(true);
    setMapping('table-per-type');
    // Only when it opens: the entities may change while it is open.
  }, [open]);

  const supertype = entities.find((e) => e.id === supertypeId);
  const create = () => {
    if (!supertypeId || subtypeIds.length === 0) return;
    createSpecialization(supertypeId, subtypeIds, { total, disjoint, mapping });
    close();
  };

  return (
    <Modal
      title={t('spec.new')}
      open={open}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!supertypeId || subtypeIds.length === 0} onClick={create}>
            {t('spec.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="spec-dialog-super" className="block font-medium">
            {t('spec.supertype')}
          </label>
          <select
            id="spec-dialog-super"
            className="field"
            value={supertypeId}
            onChange={(e) => {
              setSupertypeId(e.target.value);
              setSubtypeIds((ids) => ids.filter((id) => id !== e.target.value));
            }}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="font-medium">{t('spec.subtypes')}</legend>
          <div className="grid max-h-48 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto sm:grid-cols-2">
            {entities
              .filter((e) => e.id !== supertypeId)
              .map((e) => (
                <Checkbox
                  key={e.id}
                  label={e.name}
                  checked={subtypeIds.includes(e.id)}
                  onChange={(on) => setSubtypeIds((ids) => (on ? [...ids, e.id] : ids.filter((id) => id !== e.id)))}
                />
              ))}
          </div>
          {subtypeIds.length === 0 && <p className="text-[0.9em] text-muted">{t('spec.pickSubtypes')}</p>}
        </fieldset>
        <div className="flex flex-wrap gap-4">
          <SegmentedControl<'partial' | 'total'>
            label={t('spec.participation')}
            value={total ? 'total' : 'partial'}
            onChange={(v) => setTotal(v === 'total')}
            options={[
              { value: 'partial', label: t('spec.partial') },
              { value: 'total', label: t('spec.total') },
            ]}
          />
          <SegmentedControl<'d' | 'o'>
            label={t('spec.constraint')}
            value={disjoint ? 'd' : 'o'}
            onChange={(v) => setDisjoint(v === 'd')}
            options={[
              { value: 'd', label: t('spec.disjoint') },
              { value: 'o', label: t('spec.overlapping') },
            ]}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="font-medium">{t('spec.mapping')}</legend>
          {MAPPINGS.map((m) => (
            <label key={m} className={`flex cursor-pointer gap-2.5 rounded-[calc(var(--radius)*0.75)] border-(length:--bw) p-2.5 ${mapping === m ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <input type="radio" name="spec-dialog-mapping" className="mt-1 accent-(--c-accent)" checked={mapping === m} onChange={() => setMapping(m)} />
              <span>
                <span className="block font-medium">{t(`spec.mapping.${m}` as MessageKey)}</span>
                <span className="block text-[0.9em] text-muted">{t(`spec.mappingHint.${m}` as MessageKey, { supertype: supertype?.name ?? '' })}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
};

export default SpecializationDialog;
