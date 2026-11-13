import useT from '../../../hooks/ui/use-t';
import useDerived from '../../../hooks/data/use-derived';
import useProjectStore from '../../../stores/use-project-store';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import InspectorIssueList from './inspector-issue-list';
import InspectorSection from './inspector-section';

const InspectorOverview = () => {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  if (!project || !derived) return null;
  const { schema, issues } = derived;
  const junctions = schema.tables.filter((t) => t.kind === 'junction').length;
  const indexes = schema.tables.reduce((n, t) => n + t.indexes.length, 0);
  const stats = [
    [t('inspector.stats.tables'), schema.tables.length - junctions],
    [t('inspector.stats.junctions'), junctions],
    [t('inspector.stats.relationships'), project.relationships.length],
    [t('inspector.stats.foreignKeys'), schema.foreignKeys.length],
    [t('inspector.stats.indexes'), indexes],
  ] as const;

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1.15em] font-semibold">{t('inspector.overview')}</h2>
          <PanelHideButton panel="inspector" />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <InspectorSection title={issues.length ? t('common.warningsTitle', { count: issues.length }) : t('common.warnings')}>
        <InspectorIssueList issues={issues} />
      </InspectorSection>
      <InspectorSection title={t('inspector.shortcuts')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="font-mono font-semibold">E</dt>
          <dd>{t('inspector.shortcut.newEntity')}</dd>
          <dt className="font-mono font-semibold">{t('inspector.shortcut.deleteKey')}</dt>
          <dd>{t('inspector.shortcut.delete')}</dd>
          <dt className="font-mono font-semibold">Ctrl+Z</dt>
          <dd>{t('inspector.shortcut.undo')}</dd>
          <dt className="font-mono font-semibold">Ctrl+Y</dt>
          <dd>{t('inspector.shortcut.redo')}</dd>
          <dt className="font-mono font-semibold">F</dt>
          <dd>{t('inspector.shortcut.focus')}</dd>
          <dt className="font-mono font-semibold">{t('inspector.shortcut.panelsKeys')}</dt>
          <dd>{t('inspector.shortcut.panels')}</dd>
          <dt className="font-mono font-semibold">Esc</dt>
          <dd>{t('inspector.shortcut.deselect')}</dd>
        </dl>
      </InspectorSection>
    </>
  );
};

export default InspectorOverview;
