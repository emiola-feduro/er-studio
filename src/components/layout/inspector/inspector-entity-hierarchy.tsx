import { attributeColumn } from '../../../domain/inference';
import type { Entity } from '../../../domain/types';
import useT from '../../../hooks/ui/use-t';
import { displayType } from '../../../domain/dialects';
import { createSubtypeOf, specializationOf, supertypeSpecialization } from '../../../lib/specialization-actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';
import InspectorSection from './inspector-section';

/**
 * Where an entity sits in a specialization: as a subclass, its superclass and the attributes it
 * inherits (read only); as a superclass, its subclasses.
 */
const InspectorEntityHierarchy = ({ entity }: { entity: Entity }) => {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const select = useUiStore((s) => s.select);
  if (!project || entity.kind !== 'entity') return null;
  const asSub = supertypeSpecialization(project, entity.id);
  const asSuper = specializationOf(project, entity.id);
  if (!asSub && !asSuper) return null;
  const name = (id: string) => project.entities.find((e) => e.id === id)?.name ?? '';
  const link = (id: string) => (
    <button type="button" className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => select({ kind: 'entity', id })}>
      {name(id)}
    </button>
  );
  const parent = asSub ? project.entities.find((e) => e.id === asSub.supertypeId) : undefined;

  return (
    <InspectorSection
      title={t('spec.title')}
      action={
        <Button size="sm" variant="ghost" onClick={() => select({ kind: 'specialization', id: (asSub ?? asSuper)!.id })}>
          {t('spec.viewSpecialization')}
        </Button>
      }
    >
      <div className="space-y-3">
        {parent && (
          <div className="space-y-1.5">
            <p>
              {t('spec.subtypeOf')} {link(parent.id)}
            </p>
            {parent.attributes.length > 0 && (
              <div>
                <span className="block text-[0.9em] text-muted">{t('spec.inherited', { name: parent.name })}</span>
                <ul className="mt-1 space-y-0.5 font-canvas text-[0.92em] text-muted">
                  {parent.attributes.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>
                        {a.pk ? 'PK ' : ''}
                        {a.name}
                      </span>
                      <span>{displayType(project.dialect, attributeColumn(a))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {asSuper && (
          <div className="space-y-1.5">
            <span className="block">{t('spec.subtypes')}</span>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {asSuper.subtypeIds.map((id) => (
                <li key={id}>{link(id)}</li>
              ))}
            </ul>
            <Button size="sm" onClick={() => createSubtypeOf(entity.id)}>
              {t('canvas.createSubtype')}
            </Button>
          </div>
        )}
      </div>
    </InspectorSection>
  );
};

export default InspectorEntityHierarchy;
