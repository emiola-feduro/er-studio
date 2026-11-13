import ResizeHandle from '../../ui/resize-handle/resize-handle';
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
    <aside aria-label={t('inspector.label')} className="relative flex min-h-0 flex-col border-l border-line bg-surface">
      <ResizeHandle panel="inspector" label={t('inspector.resize')} />
      {/* The handle stays outside the scrolling area so it covers the whole edge. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {entity ? (
          <InspectorEntity key={entity.id} entity={entity} />
        ) : relationship ? (
          <InspectorRelationship key={relationship.id} relationship={relationship} />
        ) : (
          <InspectorOverview />
        )}
      </div>
    </aside>
  );
};

export default Inspector;
