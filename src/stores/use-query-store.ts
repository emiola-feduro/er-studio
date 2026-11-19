import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { QuerySpec } from '../domain/query-builder';

export const EMPTY_QUERY: QuerySpec = { tableIds: [], limit: 0 };

export type QueryTab = 'generated' | 'editor';

type QueryState = {
  /** Query being built per project, kept when leaving the tab and across reloads. */
  specs: Record<string, QuerySpec>;
  setSpec: (projectId: string, update: (spec: QuerySpec) => QuerySpec) => void;
  /** SQL written by hand per project, in the Editor tab; kept apart from the generated query. */
  customSql: Record<string, string>;
  setCustomSql: (projectId: string, sql: string | undefined) => void;
  /** Tab open per project: the generated query or the editor. */
  tabs: Record<string, QueryTab>;
  setTab: (projectId: string, tab: QueryTab) => void;
  /** Where queries run per project: its records (absent) or a saved connection's id (desktop). */
  targets: Record<string, string>;
  setTarget: (projectId: string, connectionId: string | null) => void;
  forget: (projectId: string) => void;
};

const useQueryStore = create<QueryState>()(
  persist(
    (set) => ({
      specs: {},
      customSql: {},
      tabs: {},
      targets: {},
      setTarget: (projectId, connectionId) =>
        set((s) => {
          const targets = { ...s.targets };
          if (connectionId) targets[projectId] = connectionId;
          else delete targets[projectId];
          return { targets };
        }),
      setTab: (projectId, tab) => set((s) => ({ tabs: { ...s.tabs, [projectId]: tab } })),
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
          const tabs = { ...s.tabs };
          const targets = { ...s.targets };
          delete targets[projectId];
          delete specs[projectId];
          delete customSql[projectId];
          delete tabs[projectId];
          return { specs, customSql, tabs, targets };
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
      version: 3,
      // Version 2 had "Edit SQL" replace the generated query: a project with SQL written opens in the editor.
      migrate: (persisted) => {
        const state = { customSql: {}, tabs: {}, targets: {}, ...(persisted as object) } as QueryState;
        for (const projectId of Object.keys(state.customSql)) state.tabs[projectId] ??= 'editor';
        return state;
      },
    },
  ),
);

export default useQueryStore;
