import { useCallback, useEffect, useMemo } from 'react';
import type { DataRow } from '../../domain/types';
import { getRecordIssues } from '../../lib/derived';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';
import useDerived from './use-derived';

const NO_ROWS: DataRow[] = [];

/** The table shown in the records view, its rows and their validation errors. */
const useRecordsTable = () => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const recordsTableId = useUiStore((s) => s.recordsTableId);
  const setRecordsTable = useUiStore((s) => s.setRecordsTable);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const tables = useMemo(() => derived?.schema.tables ?? [], [derived]);

  // Follow the entity selected in the diagram or sidebar. Only selection changes count,
  // so editing rows (which rebuilds the schema) never moves the user to another tab.
  useEffect(() => {
    if (selection?.kind === 'entity') setRecordsTable(selection.id);
  }, [selection, setRecordsTable]);

  /** Choosing a tab also selects that table, so the inspector shows its columns. */
  const selectTable = useCallback(
    (id: string) => {
      setRecordsTable(id);
      select({ kind: 'entity', id });
    },
    [setRecordsTable, select],
  );

  const table = tables.find((t) => t.id === recordsTableId) ?? tables[0];
  const issues = useMemo(() => (project ? getRecordIssues(project) : null), [project, derived]);
  const rows = (table && project?.records?.[table.id]) || NO_ROWS;

  return {
    tables,
    table,
    rows,
    allRecords: project?.records ?? {},
    dialect: project?.dialect ?? 'postgresql',
    cellIssues: table ? issues?.cells.get(table.id) : undefined,
    countByTable: issues?.countByTable,
    totalIssues: issues?.total ?? 0,
    selectTable,
  };
};

export default useRecordsTable;
