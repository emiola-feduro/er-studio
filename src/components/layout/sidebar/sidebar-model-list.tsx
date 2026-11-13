import { RELATIONSHIP_KIND_KEYS } from '../../../lib/labels';
import usePreferencesStore from '../../../stores/use-preferences-store';
import { formatList } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { useMemo } from 'react';
import useDerived from '../../../hooks/data/use-derived';
import { relationshipKind } from '../../../domain/model';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import SidebarModelItem from './sidebar-model-item';
import SidebarModelSection from './sidebar-model-section';

type SidebarModelListProps = {
  tables: boolean;
  relationships: boolean;
  bordered: boolean;
};

const SidebarModelList = ({ tables, relationships: showRelationships, bordered }: SidebarModelListProps) => {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const locale = usePreferencesStore((s) => s.locale);

  const issueCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of derived?.issues ?? []) {
      const key = issue.entityId ?? issue.relationshipId;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [derived]);

  if (!project) return null;
  const { entities, relationships } = project;
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.name ?? '?';

  return (
    <div className={`relative min-h-0 flex-1 overflow-y-auto px-2 py-3 ${bordered ? 'border-t border-line' : ''}`}>
      {tables && (
        <SidebarModelSection title={t('sidebar.tables')} panel="tables" empty={entities.length === 0}>
          {entities.map((entity) => (
            <SidebarModelItem
              key={entity.id}
              label={entity.name || t('common.unnamed')}
              meta={entity.kind === 'junction' ? t('sidebar.junction') : t('sidebar.attributesCount', { count: entity.attributes.length })}
              issues={issueCount.get(entity.id) ?? 0}
              active={selection?.id === entity.id}
              onSelect={() => select({ kind: 'entity', id: entity.id })}
            />
          ))}
        </SidebarModelSection>
      )}
      {showRelationships && (
        <SidebarModelSection title={t('sidebar.relationships')} panel="relationships" empty={relationships.length === 0}>
          {relationships.map((rel) => (
            <SidebarModelItem
              key={rel.id}
              label={rel.name?.trim() || formatList(rel.participants.map((p) => p.role?.trim() || nameOf(p.entityId)), locale)}
              meta={`${t(RELATIONSHIP_KIND_KEYS[relationshipKind(rel)])}, ${rel.participants.map((p) => p.cardinality).join(':')}`}
              issues={issueCount.get(rel.id) ?? 0}
              active={selection?.id === rel.id}
              onSelect={() => select({ kind: 'relationship', id: rel.id })}
            />
          ))}
        </SidebarModelSection>
      )}
    </div>
  );
};

export default SidebarModelList;
