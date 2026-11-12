import { ddlType, DIALECTS, findType } from '../domain/dialects';
import { typedValue } from '../domain/records';
import type { Project, Schema } from '../domain/types';
import type { RecordIssues } from '../domain/records';

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;

/** Excel sheet names: at most 31 characters, no []:*?/\ and unique ignoring case. */
export const sheetNames = (names: string[]) => {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(INVALID_SHEET_CHARS, '_').trim() || 'tabla').slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i += 1) {
      const suffix = `_${i}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
};


/** Builds an .xlsx workbook with one sheet per table. Invalid cells are highlighted and carry the error as a note. */
export const buildWorkbook = async (project: Project, schema: Schema, issues: RecordIssues): Promise<Blob> => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ER Studio';
  workbook.created = new Date();
  const records = project.records ?? {};
  const names = sheetNames(schema.tables.map((t) => t.name));

  schema.tables.forEach((table, index) => {
    const sheet = workbook.addWorksheet(names[index], { views: [{ state: 'frozen', ySplit: 1 }] });
    const rows = records[table.id] ?? [];
    const tableIssues = issues.cells.get(table.id);

    sheet.columns = table.columns.map((column) => ({
      header: column.name,
      key: column.id,
      width: Math.min(40, Math.max(12, column.name.length + 4)),
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECF2' } };
    table.columns.forEach((column, i) => {
      header.getCell(i + 1).note = `${ddlType(project.dialect, column)}${column.pk ? ', PK' : ''}${column.origin === 'fk' ? ', FK' : ''}${column.nullable ? '' : ', NOT NULL'}`;
    });

    for (const row of rows) {
      const excelRow = sheet.addRow(
        Object.fromEntries(table.columns.map((column) => [column.id, typedValue(project.dialect, column, row.values[column.id] ?? '')])),
      );
      table.columns.forEach((column, i) => {
        const cell = excelRow.getCell(i + 1);
        if (cell.value instanceof Date) {
          const generic = findType(DIALECTS[project.dialect], column.type)?.generic;
          cell.numFmt = generic === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss';
        }
        const error = tableIssues?.get(row.id)?.get(column.id);
        if (error) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E1' } };
          cell.note = error;
        }
      });
    }
    if (table.columns.length > 0) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
