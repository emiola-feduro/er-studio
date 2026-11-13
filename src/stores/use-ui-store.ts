import { create } from 'zustand';

export type Selection = { kind: 'entity' | 'relationship'; id: string } | null;
export type CenterView = 'diagram' | 'sql' | 'records';
/** Right-click menu on the canvas. Without an entity id it is the menu of the empty canvas. */
export type ContextMenuState = { x: number; y: number; entityId?: string; flowPosition?: { x: number; y: number } };
export type Toast = { id: number; message: string; tone: 'info' | 'error' };

type UiState = {
  selection: Selection;
  view: CenterView;
  hoveredFkId: string | null;
  relationshipDialog: { open: boolean; entityIds: string[] };
  settingsOpen: boolean;
  showFkLabels: boolean;
  newProjectOpen: boolean;
  /** What the new project dialog starts on: an empty diagram or a random model. */
  newProjectStart: 'empty' | 'random';
  sidebarOpen: boolean;
  recordsTableId: string | null;
  /** Hides every panel and tool so only the diagram is left. */
  focusMode: boolean;
  contextMenu: ContextMenuState | null;
  /** Export for AI agents; `tableId` preselects one entity. */
  agentExport: { open: boolean; tableId?: string };
  openApiExportOpen: boolean;
  toasts: Toast[];
  select: (selection: Selection) => void;
  setView: (view: CenterView) => void;
  setHoveredFk: (id: string | null) => void;
  openRelationshipDialog: (entityIds?: string[]) => void;
  closeRelationshipDialog: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleFkLabels: () => void;
  setNewProjectOpen: (open: boolean, start?: 'empty' | 'random') => void;
  setNewProjectStart: (start: 'empty' | 'random') => void;
  setSidebarOpen: (open: boolean) => void;
  setRecordsTable: (id: string | null) => void;
  setFocusMode: (on: boolean) => void;
  openContextMenu: (menu: ContextMenuState) => void;
  closeContextMenu: () => void;
  openAgentExport: (tableId?: string) => void;
  closeAgentExport: () => void;
  setOpenApiExportOpen: (open: boolean) => void;
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
};

let toastId = 0;

const useUiStore = create<UiState>((set, get) => ({
  selection: null,
  view: 'diagram',
  hoveredFkId: null,
  relationshipDialog: { open: false, entityIds: [] },
  settingsOpen: false,
  showFkLabels: true,
  newProjectOpen: false,
  newProjectStart: 'empty',
  sidebarOpen: false,
  recordsTableId: null,
  focusMode: false,
  contextMenu: null,
  agentExport: { open: false },
  openApiExportOpen: false,
  toasts: [],
  select: (selection) => set({ selection }),
  setView: (view) => set({ view }),
  setHoveredFk: (hoveredFkId) => set({ hoveredFkId }),
  openRelationshipDialog: (entityIds = []) => set({ relationshipDialog: { open: true, entityIds } }),
  closeRelationshipDialog: () => set({ relationshipDialog: { open: false, entityIds: [] } }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  toggleFkLabels: () => set({ showFkLabels: !get().showFkLabels }),
  setNewProjectOpen: (newProjectOpen, newProjectStart = 'empty') =>
    set(newProjectOpen ? { newProjectOpen, newProjectStart } : { newProjectOpen }),
  setNewProjectStart: (newProjectStart) => set({ newProjectStart }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setRecordsTable: (recordsTableId) => set({ recordsTableId }),
  setFocusMode: (focusMode) => set(focusMode ? { focusMode, view: 'diagram', contextMenu: null } : { focusMode }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  openAgentExport: (tableId) => set({ agentExport: { open: true, tableId } }),
  closeAgentExport: () => set({ agentExport: { open: false } }),
  setOpenApiExportOpen: (openApiExportOpen) => set({ openApiExportOpen }),
  notify: (message, tone = 'info') => {
    toastId += 1;
    const id = toastId;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export default useUiStore;
