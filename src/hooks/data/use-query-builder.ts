import { useEffect, useMemo, useState } from 'react';
import { buildSelect, type JoinType, type QuerySpec } from '../../domain/query-builder';
import useProjectStore from '../../stores/use-project-store';
import useDerived from './use-derived';

/** State of the query builder and the SQL it produces. Starts over when another project opens. */
const useQueryBuilder = () => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const [spec, setSpec] = useState<QuerySpec>({ tableIds: [], limit: 100 });
  const projectId = project?.id;

  useEffect(() => setSpec({ tableIds: [], limit: 100 }), [projectId]);

  const tables = derived?.schema.tables ?? [];
  const result = useMemo(
    () => (derived && project ? buildSelect(derived.schema, project.dialect, spec) : { sql: '', plan: { joins: [], unreachable: [], aliases: {} } }),
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
  const clear = () => setSpec({ tableIds: [], limit: 100 });

  /** Qualified column names (alias.column) offered while typing the WHERE. */
  const qualifiedColumns = Object.entries(result.plan.aliases).flatMap(([tableId, alias]) =>
    (tables.find((t) => t.id === tableId)?.columns ?? []).map((c) => `${alias}.${c.name}`),
  );

  return { dialect: project?.dialect, tables, spec, result, toggleTable, setJoinType, setColumns, toggleColumn, update, clear, qualifiedColumns, projectName: project?.name ?? '' };
};

export default useQueryBuilder;
