import { useReactFlow } from '@xyflow/react';
import useAutoLayout from '../../../hooks/canvas/use-auto-layout';
import { addEntity } from '../../../lib/actions';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';

const ErCanvasToolbar = () => {
  const autoLayout = useAutoLayout();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const showFkLabels = useUiStore((s) => s.showFkLabels);
  const toggleFkLabels = useUiStore((s) => s.toggleFkLabels);
  const openRelationshipDialog = useUiStore((s) => s.openRelationshipDialog);
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);
  const setShowIcons = usePreferencesStore((s) => s.setShowConstraintIcons);

  const addAtCenter = () => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const position = pane ? screenToFlowPosition({ x: pane.left + pane.width / 2 - 140, y: pane.top + pane.height / 2 - 60 }) : undefined;
    addEntity(position);
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-theme border-(length:--bw) border-line bg-surface/90 p-1.5 shadow-theme backdrop-blur-sm">
      <Button variant="primary" size="sm" onClick={addAtCenter} title="Atajo: E">
        Nueva entidad
      </Button>
      <Button size="sm" onClick={() => openRelationshipDialog()}>
        Nueva relación
      </Button>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Button size="sm" variant="ghost" onClick={autoLayout}>
        Ordenar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fitView({ padding: 0.15, duration: 250 })}>
        Ajustar vista
      </Button>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <span className="px-1">
        <Checkbox label="Nombres de FK" checked={showFkLabels} onChange={toggleFkLabels} />
      </span>
      <span className="px-1">
        <Checkbox label="Íconos de restricciones" checked={showIcons} onChange={setShowIcons} />
      </span>
    </div>
  );
};

export default ErCanvasToolbar;
