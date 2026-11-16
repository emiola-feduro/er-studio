import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { QuerySpec } from '../domain/query-builder';

export const EMPTY_QUERY: QuerySpec = { tableIds: [], limit: 0 };

type QueryState = {
  /** Query being built per project, kept when leaving the tab and across reloads. */
  specs: Record<string, QuerySpec>;
  setSpec: (projectId: string, update: (spec: QuerySpec) => QuerySpec) => void;
  /** SQL written by hand per project; when present the query is in "Edit SQL" mode. */
  customSql: Record<string, string>;
  setCustomSql: (projectId: string, sql: string | undefined) => void;
  forget: (projectId: string) => void;
};

const useQueryStore = create<QueryState>()(
  persist(
    (set) => ({
      specs: {},
      customSql: {},
      setCustomSql: (projectId, sql) =>
        set((s) => {
          const customSql = { ...s.customSql };
          if (sql === undefined) delete customSql[projectId];
          else customSql[projectId] = sql;
          return { customSql };
        }),
      setSpec: (projectId, update) => set((s) => ({ specs: { ...s.specs, [projectId]: update(s.specs[projectId] ?? EMPTY_QUERY) } })),
      forget: (projectId) =>
        set((s) => {
          const specs = { ...s.specs };
          const customSql = { ...s.customSql };
          delete specs[projectId];
          delete customSql[projectId];
          return { specs, customSql };
        }),
    }),
    {
      name: 'er-studio:queries',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      version: 2,
      migrate: (persisted) => ({ customSql: {}, ...(persisted as object) }) as QueryState,
    },
  ),
);

export default useQueryStore;
