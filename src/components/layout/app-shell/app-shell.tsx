import type { CSSProperties } from 'react';
import useProjectBootstrap from '../../../hooks/data/use-project-bootstrap';
import usePanels from '../../../hooks/ui/use-panels';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useProjectStore from '../../../stores/use-project-store';
import Workspace from '../../dynamic/workspace/workspace';
import WorkspaceEmpty from '../../dynamic/workspace/workspace-empty';
import WorkspaceError from '../../dynamic/workspace/workspace-error';
import WorkspaceSkeleton from '../../dynamic/workspace/workspace-skeleton';
import AgentExportDialog from '../../ui/agent-export-dialog/agent-export-dialog';
import NewProjectDialog from '../../ui/new-project-dialog/new-project-dialog';
import OpenApiExportDialog from '../../ui/openapi-export-dialog/openapi-export-dialog';
import RelationshipDialog from '../../ui/relationship-dialog/relationship-dialog';
import SettingsDialog from '../../ui/settings-dialog/settings-dialog';
import ToastStack from '../../ui/toast-stack/toast-stack';
import Inspector from '../inspector/inspector';
import Sidebar from '../sidebar/sidebar';
import TopBar from '../top-bar/top-bar';

const AppShell = () => {
  const { status, error, retry } = useProjectBootstrap();
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const panelWidths = usePreferencesStore((s) => s.panelWidths);
  const { isVisible, sidebar } = usePanels();
  const header = isVisible('header');
  const inspector = hasProject && isVisible('inspector');
  // The sidebar is a drawer below lg, so it only takes a column from lg up.
  const columns = {
    '--cols-md': inspector ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)',
    '--cols-lg': [sidebar && `${panelWidths.sidebar}px`, 'minmax(0,1fr)', inspector && `${panelWidths.inspector}px`].filter(Boolean).join(' '),
    '--rows-sm': inspector ? 'minmax(0,1fr) minmax(0,40vh)' : 'minmax(0,1fr)',
  } as CSSProperties;

  return (
    <div className={`grid h-full ${header ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]'}`}>
      {header && <TopBar />}
      <div
        style={columns}
        className="grid min-h-0 grid-cols-1 grid-rows-(--rows-sm) md:grid-cols-(--cols-md) md:grid-rows-1 lg:grid-cols-(--cols-lg)"
      >
        {sidebar && <Sidebar />}
        {status === 'loading' && <WorkspaceSkeleton />}
        {status === 'error' && <WorkspaceError message={error} onRetry={retry} />}
        {status === 'ready' && (hasProject ? <Workspace /> : <WorkspaceEmpty />)}
        {inspector && <Inspector />}
      </div>
      <RelationshipDialog />
      <SettingsDialog />
      <NewProjectDialog />
      <AgentExportDialog />
      <OpenApiExportDialog />
      <ToastStack />
    </div>
  );
};

export default AppShell;
