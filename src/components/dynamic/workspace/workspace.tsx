import useUiStore from '../../../stores/use-ui-store';
import PanelsFloatingBar from '../../layout/panels-menu/panels-floating-bar';
import ErCanvas from '../../ui/er-canvas/er-canvas';
import QueryBuilder from '../../ui/query-builder/query-builder';
import RecordsView from '../../ui/records-view/records-view';
import VersionsView from '../../ui/versions-view/versions-view';
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
      {view === 'queries' && <QueryBuilder />}
      {view === 'versions' && <VersionsView />}
      {view === 'diagram' && <PanelsFloatingBar />}
    </main>
  );
};

export default Workspace;
