import { discriminatorOf } from '../../../domain/specialization';
import type { Specialization, SpecializationMapping } from '../../../domain/types';
import useDerived from '../../../hooks/data/use-derived';
import useSpecializationMapping from '../../../hooks/model/use-specialization-mapping';
import useT from '../../../hooks/ui/use-t';
import type { MessageKey } from '../../../i18n';
import { deleteSpecialization, updateSpecialization } from '../../../lib/specialization-actions';
import useProjectStore from '../../../stores/use-project-store';
import Button from '../../ui/button/button';
import ConfirmDialog from '../../ui/confirm-dialog/confirm-dialog';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import SegmentedControl from '../../ui/segmented-control/segmented-control';
import InspectorIssueList from './inspector-issue-list';
import InspectorSection from './inspector-section';
import InspectorSpecializationSubtypes from './inspector-specialization-subtypes';

const MAPPINGS: SpecializationMapping[] = ['table-per-type', 'single-table', 'table-per-concrete'];

/** Superclass, subclasses, total or partial, disjoint or overlapping, and how it becomes tables. */
const InspectorSpecialization = ({ spec }: { spec: Specialization }) => {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const mapping = useSpecializationMapping(spec);
  if (!project) return null;
  const { id, name, supertypeId, total, disjoint } = spec;
  const entities = project.entities;
  const supertype = entities.find((e) => e.id === supertypeId);
  const disc = discriminatorOf(spec, entities, project.namesLocale);
  const update = (patch: Partial<Specialization>, key?: string) => updateSpecialization(id, patch, key);
  const issues = derived?.issues.filter((i) => i.specializationId === id) ?? [];
  // Tables this hierarchy ends up as: the supertype's and the subtypes' that exist in the schema.
  const tables = (derived?.schema.tables ?? []).filter((table) => table.id === supertypeId || spec.subtypeIds.includes(table.id));

  return (
    <>
      <div className="space-y-3 border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1.15em] font-semibold">{t('spec.title')}</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="danger" onClick={() => deleteSpecialization(id)}>
              {t('common.delete')}
            </Button>
            <PanelHideButton panel="inspector" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`spec-name-${id}`} className="block font-medium">
            {t('spec.nameOptional')}
          </label>
          <input id={`spec-name-${id}`} className="field" value={name ?? ''} onChange={(e) => update({ name: e.target.value || undefined }, `spec-name:${id}`)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`spec-super-${id}`} className="block font-medium">
            {t('spec.supertype')}
          </label>
          <select id={`spec-super-${id}`} className="field font-semibold" value={supertypeId} onChange={(e) => update({ supertypeId: e.target.value, subtypeIds: spec.subtypeIds.filter((s) => s !== e.target.value) })}>
            {entities
              .filter((e) => e.kind === 'entity')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <InspectorSection title={t('spec.subtypes')}>
        <InspectorSpecializationSubtypes spec={spec} entities={entities} />
      </InspectorSection>
      <InspectorSection title={t('spec.rules')}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('spec.participation')}</span>
            <SegmentedControl<'total' | 'partial'>
              label={t('spec.participation')}
              size="sm"
              value={total ? 'total' : 'partial'}
              onChange={(v) => update({ total: v === 'total' })}
              options={[
                { value: 'partial', label: t('spec.partial') },
                { value: 'total', label: t('spec.total') },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('spec.constraint')}</span>
            <SegmentedControl<'d' | 'o'>
              label={t('spec.constraint')}
              size="sm"
              value={disjoint ? 'd' : 'o'}
              onChange={(v) => update({ disjoint: v === 'd' })}
              options={[
                { value: 'd', label: t('spec.disjoint') },
                { value: 'o', label: t('spec.overlapping') },
              ]}
            />
          </div>
        </div>
      </InspectorSection>
      <InspectorSection title={t('spec.mapping')}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('spec.mapping')}</legend>
          {MAPPINGS.map((m) => (
            <label key={m} className={`flex cursor-pointer gap-2.5 rounded-[calc(var(--radius)*0.75)] border-(length:--bw) p-2.5 ${spec.mapping === m ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <input type="radio" name={`spec-mapping-${id}`} className="mt-1 accent-(--c-accent)" checked={spec.mapping === m} onChange={() => mapping.request(m)} />
              <span>
                <span className="block font-medium">{t(`spec.mapping.${m}` as MessageKey)}</span>
                <span className="block text-[0.9em] text-muted">{t(`spec.mappingHint.${m}` as MessageKey, { supertype: supertype?.name ?? '' })}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </InspectorSection>
      {disjoint && spec.mapping !== 'table-per-concrete' && (
        <InspectorSection title={t('spec.discriminator')}>
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-2">
              <label htmlFor={`spec-disc-${id}`}>{t('spec.discriminatorColumn')}</label>
              <input
                id={`spec-disc-${id}`}
                className="field field-sm font-canvas"
                placeholder={disc.name}
                value={spec.discriminator?.name ?? ''}
                onChange={(e) => update({ discriminator: { name: e.target.value, values: spec.discriminator?.values ?? {} } }, `spec-disc:${id}`)}
              />
              {spec.subtypeIds.map((subId) => {
                const sub = entities.find((e) => e.id === subId);
                if (!sub) return null;
                return (
                  <div key={subId} className="contents">
                    <label htmlFor={`spec-disc-${id}-${subId}`} className="truncate">
                      {t('spec.discriminatorValue', { name: sub.name })}
                    </label>
                    <input
                      id={`spec-disc-${id}-${subId}`}
                      className="field field-sm font-canvas"
                      placeholder={sub.name}
                      value={spec.discriminator?.values[subId] ?? ''}
                      onChange={(e) =>
                        update({ discriminator: { name: spec.discriminator?.name ?? '', values: { ...spec.discriminator?.values, [subId]: e.target.value } } }, `spec-disc:${id}:${subId}`)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </InspectorSection>
      )}
      <InspectorSection title={t('spec.result')}>
        {tables.length === 0 ? (
          <p className="text-muted">{t('spec.noTables')}</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((table) => (
              <li key={table.id} className="rounded-[calc(var(--radius)*0.75)] bg-surface-2 px-3 py-2 font-canvas text-[0.92em] leading-relaxed">
                <span className="font-semibold">{table.name}</span>({table.columns.map((c) => `${c.name}${c.pk ? ' PK' : ''}${c.origin === 'fk' ? ' FK' : ''}`).join(', ')})
                {(table.checks?.length ?? 0) > 0 && <span className="block text-muted">CHECK: {table.checks!.length}</span>}
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>
      {issues.length > 0 && (
        <InspectorSection title={t('common.warningsTitle', { count: issues.length })}>
          <InspectorIssueList issues={issues} />
        </InspectorSection>
      )}
      <ConfirmDialog
        open={Boolean(mapping.pending)}
        title={t('spec.hiddenRecordsTitle')}
        message={t('spec.hiddenRecords', { tables: mapping.pending?.tables.join(', ') ?? '' })}
        confirmLabel={t('spec.change')}
        onConfirm={mapping.confirm}
        onCancel={mapping.cancel}
      />
    </>
  );
};

export default InspectorSpecialization;
