import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ColumnWidthState = {
  /** Widths the person dragged, by "scope:column". A missing one is fitted to the content. */
  widths: Record<string, number>;
  setWidth: (key: string, width: number) => void;
  /** Back to fitting the content. */
  clearWidth: (key: string) => void;
};

const useColumnWidthStore = create<ColumnWidthState>()(
  persist(
    (set) => ({
      widths: {},
      setWidth: (key, width) => set((s) => ({ widths: { ...s.widths, [key]: Math.round(width) } })),
      clearWidth: (key) =>
        set((s) => {
          const widths = { ...s.widths };
          delete widths[key];
          return { widths };
        }),
    }),
    {
      name: 'er-studio:column-widths',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      version: 1,
    },
  ),
);

export default useColumnWidthStore;
