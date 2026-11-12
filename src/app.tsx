import { ReactFlowProvider } from '@xyflow/react';
import AppShell from './components/layout/app-shell/app-shell';
import useApplyPreferences from './hooks/ui/use-apply-preferences';
import useKeyboardShortcuts from './hooks/ui/use-keyboard-shortcuts';

const App = () => {
  useApplyPreferences();
  useKeyboardShortcuts();

  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
};

export default App;
