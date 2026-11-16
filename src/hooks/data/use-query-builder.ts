import { useMemo } from 'react';
import { buildSelect, planJoins, renameAliases, type JoinType, type QueryPlan, type QuerySpec } from '../../domain/query-builder';
import type { WhereColumn } from '../../domain/query-where';
import useProjectStore from '../../stores/use-project-store';
import useQueryStore, { EMPTY_QUERY, type QueryTab } from '../../stores/use-query-store';
import useDerived from './use-derived';

/** State of the query builder and the SQL it produces. Each project keeps its own query. */
const useQueryBuilder = () => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const projectId = project?.id ?? '';
  const stored = useQueryStore((s) => s.specs[projectId]);
  const setStored = useQueryStore((s) => s.setSpec);
  const customSql = useQueryStore((s) => s.customSql[projectId]) ?? '';
  const tab = useQueryStore((s) => s.tabs[projectId]) ?? 'generated';
  const setTab = (next: QueryTab) => projectId && useQueryStore.getState().setTab(projectId, next);
  const setCustomSql = (sql: string | undefined) => projectId && useQueryStore.getState().setCustomSql(projectId, sql);

  const tables = derived?.schema.tables ?? [];
  // Tables deleted since the query was built drop out of it.
  const spec = useMemo((): QuerySpec => {
    const base = stored ?? EMPTY_QUERY;
    const ids = new Set(tables.map((t) => t.id));
    return base.tableIds.every((id) => ids.has(id)) ? base : { ...base, tableIds: base.tableIds.filter((id) => ids.has(id)) };
  }, [stored, tables]);
  const setSpec = (update: (spec: QuerySpec) => QuerySpec) => projectId && setStored(projectId, update);

  const result = useMemo(
    () => (derived && project ? buildSelect(derived.schema, project.dialect, spec) : { sql: '', plan: { joins: [], unreachable: [], aliases: {}, aliasProblems: {} } as QueryPlan }),
    [derived, project, spec],
  );

  const toggleTable = (tableId: string, on: boolean) =>
    setSpec((s) => ({ ...s, tableIds: on ? [...s.tableIds, tableId] : s.tableIds.filter((id) => id !== tableId) }));
  const setJoinType = (tableId: string, type: JoinType) => setSpec((s) => ({ ...s, joinTypes: { ...s.joinTypes, [tableId]: type } }));
  const setColumns = (tableId: string, columnIds: string[] | undefined) =>
    setSpec((s) => {
      const columns = { ...s.columns };
      if (columnIds) columns[tableId] = columnIds;
      else delete columns[tableId];
      return { ...s, columns };
    });
  const toggleColumn = (tableId: string, columnId: string, on: boolean) => {
    const all = tables.find((t) => t.id === tableId)?.columns.map((c) => c.id) ?? [];
    const current = spec.columns?.[tableId] ?? all;
    setColumns(tableId, on ? all.filter((id) => current.includes(id) || id === columnId) : current.filter((id) => id !== columnId));
  };
  const update = (patch: Partial<QuerySpec>) => setSpec((s) => ({ ...s, ...patch }));
  const clear = () => setSpec(() => EMPTY_QUERY);

  /** Sets a table's alias (empty goes back to the automatic one) and renames it in the WHERE. */
  const setAlias = (tableId: string, alias: string) => {
    if (!derived || !project) return;
    const aliases = { ...spec.aliases };
    if (alias.trim()) aliases[tableId] = alias.trim();
    else delete aliases[tableId];
    const next = { ...spec, aliases };
    const after = planJoins(derived.schema, next, project.dialect).aliases;
    const renames = Object.fromEntries(Object.entries(result.plan.aliases).map(([id, old]) => [old, after[id] ?? old]));
    setSpec((s) => ({ ...s, aliases, where: s.where ? renameAliases(s.where, renames) : s.where }));
  };

  /** Columns of every table in the query, written alias.column, for the WHERE. */
  const whereColumns = useMemo(
    (): WhereColumn[] =>
      Object.entries(result.plan.aliases).flatMap(([tableId, alias]) =>
        (tables.find((t) => t.id === tableId)?.columns ?? []).map((c) => ({ ref: `${alias}.${c.name}`, column: c })),
      ),
    [result.plan.aliases, tables],
  );

  return {
    project,
    dialect: project?.dialect,
    tables,
    spec,
    result,
    toggleTable,
    setJoinType,
    setColumns,
    toggleColumn,
    update,
    clear,
    setAlias,
    whereColumns,
    customSql,
    setCustomSql,
    tab,
    setTab,
    projectName: project?.name ?? '',
  };
};

export default useQueryBuilder;
