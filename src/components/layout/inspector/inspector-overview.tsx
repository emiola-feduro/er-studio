import useDerived from '../../../hooks/data/use-derived';
import useProjectStore from '../../../stores/use-project-store';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import InspectorIssueList from './inspector-issue-list';
import InspectorSection from './inspector-section';

const InspectorOverview = () => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  if (!project || !derived) return null;
  const { schema, issues } = derived;
  const junctions = schema.tables.filter((t) => t.kind === 'junction').length;
  const indexes = schema.tables.reduce((n, t) => n + t.indexes.length, 0);
  const stats = [
    ['Tablas', schema.tables.length - junctions],
    ['Intermedias', junctions],
    ['Relaciones', project.relationships.length],
    ['Llaves foráneas', schema.foreignKeys.length],
    ['Índices', indexes],
  ] as const;

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1.15em] font-semibold">Resumen del modelo</h2>
          <PanelHideButton panel="inspector" label="resumen e inspector" />
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
      <InspectorSection title={issues.length ? `Avisos (${issues.length})` : 'Avisos'}>
        <InspectorIssueList issues={issues} />
      </InspectorSection>
      <InspectorSection title="Atajos">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="font-mono font-semibold">E</dt>
          <dd>Nueva entidad</dd>
          <dt className="font-mono font-semibold">Supr</dt>
          <dd>Eliminar la selección</dd>
          <dt className="font-mono font-semibold">Ctrl+Z</dt>
          <dd>Deshacer</dd>
          <dt className="font-mono font-semibold">Ctrl+Y</dt>
          <dd>Rehacer</dd>
          <dt className="font-mono font-semibold">F</dt>
          <dd>Solo diagrama</dd>
          <dt className="font-mono font-semibold">Esc</dt>
          <dd>Quitar selección</dd>
        </dl>
      </InspectorSection>
    </>
  );
};

export default InspectorOverview;
