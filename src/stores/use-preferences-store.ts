import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_LOCALE, isLocale, setLocale, t, type Locale, type MessageKey } from '../i18n';
import { DEFAULT_THEME_ID } from '../lib/themes/themes';

export type TextSize = 'sm' | 'md' | 'lg';
export type PanelId = 'header' | 'projects' | 'tables' | 'relationships' | 'inspector';

/** Panels that can be hidden. `shortcut` is the digit used with Alt to toggle each one. */
export const PANELS: { id: PanelId; label: MessageKey; shortcut: string }[] = [
  { id: 'projects', label: 'panels.projects', shortcut: '1' },
  { id: 'tables', label: 'panels.tables', shortcut: '2' },
  { id: 'relationships', label: 'panels.relationships', shortcut: '3' },
  { id: 'inspector', label: 'panels.inspector', shortcut: '4' },
  { id: 'header', label: 'panels.header', shortcut: '5' },
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
  sidebarWidth: number;
  hiddenPanels: Partial<Record<PanelId, boolean>>;
  setLocale: (locale: Locale) => void;
  setTheme: (id: string) => void;
  setUiFont: (id: string) => void;
  setCanvasFont: (id: string) => void;
  setSqlFont: (id: string) => void;
  setTextSize: (size: TextSize) => void;
  setShowConstraintIcons: (show: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setPanelHidden: (id: PanelId, hidden: boolean) => void;
};

export const SIDEBAR_WIDTH = { min: 200, max: 520, default: 272 } as const;

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
      sidebarWidth: SIDEBAR_WIDTH.default,
      hiddenPanels: {},
      setTheme: (themeId) => set({ themeId }),
      setUiFont: (uiFontId) => set({ uiFontId }),
      setCanvasFont: (canvasFontId) => set({ canvasFontId }),
      setSqlFont: (sqlFontId) => set({ sqlFontId }),
      setTextSize: (textSize) => set({ textSize }),
      setShowConstraintIcons: (showConstraintIcons) => set({ showConstraintIcons }),
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width))) }),
      setPanelHidden: (id, hidden) => set((s) => ({ hiddenPanels: { ...s.hiddenPanels, [id]: hidden } })),
    }),
    {
      name: 'er-studio:preferences',
      storage: createJSONStorage(() => safeStorage),
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
