import useT from '../../../hooks/ui/use-t';
import type { Entity } from '../../../domain/types';
import useDerived from '../../../hooks/data/use-derived';
import InspectorAttributeList from './inspector-attribute-list';
import InspectorEntityHeader from './inspector-entity-header';
import InspectorFkColumns from './inspector-fk-columns';
import InspectorIndexList from './inspector-index-list';
import InspectorIssueList from './inspector-issue-list';
import InspectorJunction from './inspector-junction';
import InspectorSection from './inspector-section';

const InspectorEntity = ({ entity }: { entity: Entity }) => {
  const t = useT();
  const derived = useDerived();
  const { id, kind } = entity;
  const table = derived?.schema.tables.find((t) => t.id === id);
  const issues = derived?.issues.filter((i) => i.entityId === id) ?? [];

  return (
    <>
      <InspectorEntityHeader entity={entity} />
      {kind === 'junction' && <InspectorJunction entity={entity} />}
      <InspectorAttributeList entity={entity} />
      {table && <InspectorFkColumns table={table} />}
      {table && <InspectorIndexList entity={entity} table={table} />}
      {issues.length > 0 && (
        <InspectorSection title={t('common.warningsTitle', { count: issues.length })}>
          <InspectorIssueList issues={issues} />
        </InspectorSection>
      )}
    </>
  );
};

export default InspectorEntity;
