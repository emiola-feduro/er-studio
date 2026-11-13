import useUiStore from '../../../stores/use-ui-store';
import PanelsFloatingBar from '../../layout/panels-menu/panels-floating-bar';
import ErCanvas from '../../ui/er-canvas/er-canvas';
import RecordsView from '../../ui/records-view/records-view';
import SqlPreview from '../../ui/sql-preview/sql-preview';

/** Center area once the project is loaded: diagram, DDL or data rows. */
const Workspace = () => {
  const view = useUiStore((s) => s.view);

  return (
    <main className="relative min-h-0 min-w-0">
      <div className={view === 'diagram' ? 'h-full' : 'hidden'}>
        <ErCanvas />
      </div>
      {view === 'sql' && <SqlPreview />}
      {view === 'records' && <RecordsView />}
      {view === 'diagram' && <PanelsFloatingBar />}
    </main>
  );
};

export default Workspace;
