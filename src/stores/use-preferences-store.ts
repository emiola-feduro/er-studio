import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_LOCALE, isLocale, setLocale, t, type Locale, type MessageKey } from '../i18n';
import { DEFAULT_THEME_ID } from '../lib/themes/themes';

export type TextSize = 'sm' | 'md' | 'lg';
export type PanelId = 'header' | 'projects' | 'tables' | 'relationships' | 'inspector' | 'queryBuilder' | 'queryResults';

/** Panels that can be hidden. `shortcut` is the digit used with Alt to toggle each one. */
export const PANELS: { id: PanelId; label: MessageKey; shortcut: string }[] = [
  { id: 'projects', label: 'panels.projects', shortcut: '1' },
  { id: 'tables', label: 'panels.tables', shortcut: '2' },
  { id: 'relationships', label: 'panels.relationships', shortcut: '3' },
  { id: 'inspector', label: 'panels.inspector', shortcut: '4' },
  { id: 'header', label: 'panels.header', shortcut: '5' },
  { id: 'queryBuilder', label: 'panels.queryBuilder', shortcut: '6' },
  { id: 'queryResults', label: 'panels.queryResults', shortcut: '7' },
];

export const panelShortcut = (id: PanelId) => `Alt+${PANELS.find((p) => p.id === id)!.shortcut}`;

type PreferencesState = {
  locale: Locale;
  themeId: string;
  uiFontId: string;
  canvasFontId: string;
  sqlFontId: string;
  textSize: TextSize;
  showConstraintIcons: boolean;
  /** Width in pixels of each resizable side panel (wide screens only). */
  panelWidths: Record<ResizablePanel, number>;
  hiddenPanels: Partial<Record<PanelId, boolean>>;
  /** The project list folded to its title, like a dropdown. */
  collapsedSections: Partial<Record<SidebarSection, boolean>>;
  /** Tables and relationships folded per project, so a new project starts with both open. */
  collapsedByProject: Record<string, Partial<Record<ModelSection, boolean>>>;
  setLocale: (locale: Locale) => void;
  setTheme: (id: string) => void;
  setUiFont: (id: string) => void;
  setCanvasFont: (id: string) => void;
  setSqlFont: (id: string) => void;
  setTextSize: (size: TextSize) => void;
  setShowConstraintIcons: (show: boolean) => void;
  setPanelWidth: (panel: ResizablePanel, width: number) => void;
  setPanelHidden: (id: PanelId, hidden: boolean) => void;
  setSectionCollapsed: (id: SidebarSection, collapsed: boolean) => void;
  setModelSectionCollapsed: (projectId: string, id: ModelSection, collapsed: boolean) => void;
  forgetProjectSections: (projectId: string) => void;
};

export type SidebarSection = 'projects' | 'connections' | 'tables' | 'relationships';
export type ModelSection = 'tables' | 'relationships';

/** Side panels change width; queryResults changes height. */
export type ResizablePanel = 'sidebar' | 'inspector' | 'queryBuilder' | 'queryResults';

export const PANEL_WIDTHS: Record<ResizablePanel, { min: number; max: number; default: number }> = {
  sidebar: { min: 200, max: 520, default: 272 },
  inspector: { min: 320, max: 760, default: 410 },
  queryBuilder: { min: 240, max: 640, default: 320 },
  queryResults: { min: 120, max: 1000, default: 320 },
};

/** localStorage can throw in private windows; preferences then just do not persist. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      // The i18n module reads the language synchronously, so it changes before components re-render.
      setLocale: (locale) => {
        setLocale(locale);
        set({ locale });
      },
      themeId: DEFAULT_THEME_ID,
      uiFontId: 'system',
      canvasFontId: 'system',
      sqlFontId: 'jetbrains-mono',
      textSize: 'md',
      showConstraintIcons: false,
      panelWidths: Object.fromEntries(Object.entries(PANEL_WIDTHS).map(([k, v]) => [k, v.default])) as Record<ResizablePanel, number>,
      hiddenPanels: {},
      collapsedSections: {},
      collapsedByProject: {},
      setTheme: (themeId) => set({ themeId }),
      setUiFont: (uiFontId) => set({ uiFontId }),
      setCanvasFont: (canvasFontId) => set({ canvasFontId }),
      setSqlFont: (sqlFontId) => set({ sqlFontId }),
      setTextSize: (textSize) => set({ textSize }),
      setShowConstraintIcons: (showConstraintIcons) => set({ showConstraintIcons }),
      setPanelWidth: (panel, width) => {
        const { min, max } = PANEL_WIDTHS[panel];
        set((s) => ({ panelWidths: { ...s.panelWidths, [panel]: Math.round(Math.min(max, Math.max(min, width))) } }));
      },
      setPanelHidden: (id, hidden) => set((s) => ({ hiddenPanels: { ...s.hiddenPanels, [id]: hidden } })),
      setSectionCollapsed: (id, collapsed) => set((s) => ({ collapsedSections: { ...s.collapsedSections, [id]: collapsed } })),
      setModelSectionCollapsed: (projectId, id, collapsed) =>
        set((s) => ({ collapsedByProject: { ...s.collapsedByProject, [projectId]: { ...s.collapsedByProject[projectId], [id]: collapsed } } })),
      forgetProjectSections: (projectId) =>
        set((s) => {
          const collapsedByProject = { ...s.collapsedByProject };
          delete collapsedByProject[projectId];
          return { collapsedByProject };
        }),
    }),
    {
      name: 'er-studio:preferences',
      storage: createJSONStorage(() => safeStorage),
      version: 3,
      // Version 0 saved only the left panel width, as sidebarWidth.
      migrate: (persisted, version) => {
        const state = persisted as Partial<PreferencesState> & { sidebarWidth?: number };
        if (version < 1) {
          state.panelWidths = { sidebar: state.sidebarWidth ?? PANEL_WIDTHS.sidebar.default, inspector: PANEL_WIDTHS.inspector.default } as Record<ResizablePanel, number>;
          delete state.sidebarWidth;
        }
        // Version 2 added the query panels and the folded sidebar sections.
        state.panelWidths = { ...Object.fromEntries(Object.entries(PANEL_WIDTHS).map(([k, v]) => [k, v.default])), ...state.panelWidths } as Record<ResizablePanel, number>;
        state.collapsedSections ??= {};
        state.collapsedByProject ??= {};
        return state as PreferencesState;
      },
      onRehydrateStorage: () => (state) => {
        if (state && !isLocale(state.locale)) state.locale = DEFAULT_LOCALE;
        if (state) setLocale(state.locale);
      },
    },
  ),
);


setLocale(usePreferencesStore.getState().locale);

/** Label of a panel in the current language. */
export const panelLabel = (id: PanelId) => t(PANELS.find((p) => p.id === id)!.label);

export default usePreferencesStore;
