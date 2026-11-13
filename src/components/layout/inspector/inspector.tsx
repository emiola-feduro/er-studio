import useT from '../../../hooks/ui/use-t';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import InspectorEntity from './inspector-entity';
import InspectorOverview from './inspector-overview';
import InspectorRelationship from './inspector-relationship';

const Inspector = () => {
  const t = useT();
  const selection = useUiStore((s) => s.selection);
  const entity = useProjectStore((s) =>
    selection?.kind === 'entity' ? s.project?.entities.find((e) => e.id === selection.id) : undefined,
  );
  const relationship = useProjectStore((s) =>
    selection?.kind === 'relationship' ? s.project?.relationships.find((r) => r.id === selection.id) : undefined,
  );

  return (
    <aside aria-label={t('inspector.label')} className="relative flex min-h-0 flex-col overflow-y-auto border-l border-line bg-surface">
      {entity ? (
        <InspectorEntity key={entity.id} entity={entity} />
      ) : relationship ? (
        <InspectorRelationship key={relationship.id} relationship={relationship} />
      ) : (
        <InspectorOverview />
      )}
    </aside>
  );
};

export default Inspector;
