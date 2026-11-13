import { t } from '../../i18n';
import { useCallback, useState } from 'react';
import { generateInserts, recordsToJson, tableToCsv } from '../../domain/records-export';
import type { Project } from '../../domain/types';
import { getDerived, getRecordIssues } from '../../lib/derived';
import { buildWorkbook, sheetNames } from '../../lib/excel';
import { downloadBlob, downloadText, slug } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

export type RecordsFormat = 'xlsx' | 'sql' | 'csv-zip' | 'csv-table' | 'json';

/** Excel opens UTF-8 CSV correctly only with a byte order mark. */
const BOM = '﻿';

const run = async (format: RecordsFormat, project: Project, tableId?: string) => {
  const { schema } = getDerived(project);
  const base = `${slug(project.name)}-${slug(t('export.fileSuffixRecords'))}`;
  const issues = getRecordIssues(project);
  const invalidNote = (count: number) => (count > 0 ? t('export.invalidCells', { count }) : '');

  switch (format) {
    case 'xlsx': {
      downloadBlob(`${base}.xlsx`, await buildWorkbook(project, schema, issues));
      return issues.total > 0 ? t('export.excelDoneWithErrors', { count: issues.total }) : t('export.excelDone');
    }
    case 'sql': {
      const { sql, rowCount, invalidCells } = generateInserts(project, schema);
      downloadText(`${base}.sql`, sql, 'application/sql');
      return t('export.insertDone', { count: rowCount }) + invalidNote(invalidCells);
    }
    case 'json':
      downloadText(`${base}.json`, recordsToJson(project, schema), 'application/json');
      return t('export.jsonDone');
    case 'csv-table': {
      const table = schema.tables.find((t) => t.id === tableId);
      if (!table) return null;
      const rows = project.records?.[table.id] ?? [];
      downloadText(`${slug(table.name)}.csv`, BOM + tableToCsv(table, rows), 'text/csv;charset=utf-8');
      return t('export.csvTableDone', { name: table.name });
    }
    case 'csv-zip': {
      const { zipSync, strToU8 } = await import('fflate');
      const names = sheetNames(schema.tables.map((t) => t.name));
      const files = Object.fromEntries(
        schema.tables.map((table, i) => [`${names[i]}.csv`, strToU8(BOM + tableToCsv(table, project.records?.[table.id] ?? []))]),
      );
      const zip = zipSync(files);
      downloadBlob(`${base}-csv.zip`, new Blob([zip], { type: 'application/zip' }));
      return t('export.csvZipDone', { count: schema.tables.length });
    }
  }
};

/** Downloads the data rows as Excel, INSERT statements, CSV or JSON. */
const useExportRecords = () => {
  const [busy, setBusy] = useState(false);

  const exportRecords = useCallback(async (format: RecordsFormat, tableId?: string) => {
    const project = useProjectStore.getState().project;
    const { notify } = useUiStore.getState();
    if (!project) return;
    setBusy(true);
    try {
      const message = await run(format, project, tableId);
      if (message) notify(message);
    } catch {
      notify(t('export.recordsFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }, []);

  return { exportRecords, busy };
};

export default useExportRecords;
