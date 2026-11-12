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
  const { id, junction } = entity;
  const relationship = useProjectStore((s) => s.project?.relationships.find((r) => r.id === junction?.relationshipId));
  const select = useUiStore((s) => s.select);
  if (!junction) return null;
  const { pkMode, keepUniqueOnFks } = junction;

  return (
    <InspectorSection
      title="Llave primaria"
      action={
        relationship && (
          <Button size="sm" variant="ghost" onClick={() => select({ kind: 'relationship', id: relationship.id })}>
            Ver relación {relationshipKind(relationship)}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <SegmentedControl
          label="Tipo de llave primaria"
          value={pkMode}
          onChange={(mode) => setJunctionPkMode(id, mode)}
          options={[
            { value: 'composite', label: 'Compuesta por las FKs' },
            { value: 'surrogate', label: 'PK propia' },
          ]}
        />
        {pkMode === 'composite' ? (
          <p className="leading-relaxed text-muted">
            Para ampliar la PK, marca PK en un atributo propio de esta tabla (por ejemplo una fecha).
          </p>
        ) : (
          <Checkbox
            label="Mantener UNIQUE sobre las FKs"
            checked={keepUniqueOnFks}
            onChange={(checked) => setJunctionKeepUnique(id, checked)}
          />
        )}
      </div>
    </InspectorSection>
  );
};

export default InspectorJunction;
