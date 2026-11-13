import { RELATIONSHIP_TITLE_KEYS } from '../../../lib/labels';
import useT from '../../../hooks/ui/use-t';
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


const InspectorRelationship = ({ relationship }: { relationship: Relationship }) => {
  const t = useT();
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
          <h2 className="text-[1.15em] font-semibold">{t(RELATIONSHIP_TITLE_KEYS[relationshipKind(relationship)])}</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="danger" onClick={() => deleteRelationship(id)}>
              {t('common.delete')}
            </Button>
            <PanelHideButton panel="inspector" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`rel-name-${id}`} className="block font-medium">
            {t('rel.nameOptional')}
          </label>
          <input
            id={`rel-name-${id}`}
            className="field"
            placeholder={t('rel.namePlaceholder')}
            value={name ?? ''}
            onChange={(e) => updateRelationship(id, { name: e.target.value || undefined }, `rel-name:${id}`)}
          />
        </div>
        {junction && (
          <p>
            {t('rel.junctionTable')}{' '}
            <button type="button" className="font-semibold text-accent underline underline-offset-2" onClick={() => select({ kind: 'entity', id: junction.id })}>
              {junction.name}
            </button>
          </p>
        )}
      </div>
      <InspectorSection
        title={t('rel.participants')}
        action={
          participants.length === 2 && (
            <Button size="sm" variant="ghost" onClick={() => swapParticipants(id)}>
              {t('rel.swap')}
            </Button>
          )
        }
      >
        <InspectorParticipantList relationship={relationship} />
      </InspectorSection>
      <InspectorSection title={t('rel.generatedFks')}>
        <InspectorRelationshipResult relationshipId={id} />
        {canBeIdentifying && (
          <div className="mt-3">
            <Checkbox
              label={t('rel.identifying')}
              checked={identifying}
              onChange={(v) => updateRelationship(id, { identifying: v })}
            />
          </div>
        )}
      </InspectorSection>
      <InspectorSection title={t('rel.referentialActions')}>
        <InspectorReferentialActions relationship={relationship} />
      </InspectorSection>
      {issues.length > 0 && (
        <InspectorSection title={t('common.warningsTitle', { count: issues.length })}>
          <InspectorIssueList issues={issues} />
        </InspectorSection>
      )}
    </>
  );
};

export default InspectorRelationship;
