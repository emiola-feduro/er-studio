import { RELATIONSHIP_KIND_KEYS } from '../../../lib/labels';
import useT from '../../../hooks/ui/use-t';
import { relationshipKind } from '../../../domain/model';
import type { Entity } from '../../../domain/types';
import { setJunctionKeepUnique, setJunctionPkMode } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';
import Checkbox from '../../ui/checkbox/checkbox';
import SegmentedControl from '../../ui/segmented-control/segmented-control';
import InspectorSection from './inspector-section';

const InspectorJunction = ({ entity }: { entity: Entity }) => {
  const t = useT();
  const { id, junction } = entity;
  const relationship = useProjectStore((s) => s.project?.relationships.find((r) => r.id === junction?.relationshipId));
  const select = useUiStore((s) => s.select);
  if (!junction) return null;
  const { pkMode, keepUniqueOnFks } = junction;

  return (
    <InspectorSection
      title={t('junction.primaryKey')}
      action={
        relationship && (
          <Button size="sm" variant="ghost" onClick={() => select({ kind: 'relationship', id: relationship.id })}>
            {t('junction.viewRelationship', { kind: t(RELATIONSHIP_KIND_KEYS[relationshipKind(relationship)]) })}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <SegmentedControl
          label={t('junction.pkType')}
          value={pkMode}
          onChange={(mode) => setJunctionPkMode(id, mode)}
          options={[
            { value: 'composite', label: t('junction.composite') },
            { value: 'surrogate', label: t('junction.surrogate') },
          ]}
        />
        {pkMode === 'composite' ? (
          <p className="leading-relaxed text-muted">
            {t('junction.extendHint')}
          </p>
        ) : (
          <Checkbox
            label={t('junction.keepUnique')}
            checked={keepUniqueOnFks}
            onChange={(checked) => setJunctionKeepUnique(id, checked)}
          />
        )}
      </div>
    </InspectorSection>
  );
};

export default InspectorJunction;
