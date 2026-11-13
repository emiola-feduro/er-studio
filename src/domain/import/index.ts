import type { Locale } from '../../i18n';
import type { DialectId, Project } from '../types';
import { parseDbml } from './dbml-parser';
import { parseSql } from './sql-parser';
import { irToProject, type ImportReport } from './to-project';

export type ImportFormat = 'sql' | 'dbml';

/** DBML when the text has Table or Ref blocks and no CREATE TABLE. */
export const detectFormat = (text: string): ImportFormat =>
  !/\bCREATE\s+TABLE\b/i.test(text) && /(^|\n)\s*(Table|Ref|Enum|Project)\b[^\n{]*\{/i.test(text) ? 'dbml' : 'sql';

/** Gestor guessed from details only one of them uses. */
export const detectDialect = (text: string): DialectId => {
  const has = (re: RegExp) => re.test(text);
  if (has(/`|\bAUTO_INCREMENT\b|\bENGINE\s*=|\bUNSIGNED\b|\bTINYINT\s*\(1\)/i)) return 'mysql';
  if (has(/\[[A-Za-z_][^\]\n]*\]\s|\bIDENTITY\s*\(|\bNVARCHAR\b|\bDATETIME2\b|\bUNIQUEIDENTIFIER\b|(^|\n)\s*GO\s*($|\n)/i)) return 'sqlserver';
  if (has(/\bVARCHAR2\b|\bNUMBER\s*\(|\bCLOB\b|\bSYSDATE\b|\bSYSTIMESTAMP\b/i)) return 'oracle';
  if (has(/\bAUTOINCREMENT\b|\bPRAGMA\b|\bWITHOUT\s+ROWID\b/i)) return 'sqlite';
  return 'postgresql';
};

export type ImportResult = { project: Project; report: ImportReport; format: ImportFormat; dialect: DialectId };

/**
 * Reads a DDL script or a DBML file into a new project. The gestor is the one asked for, else the one
 * the DBML names, else the one the syntax suggests.
 */
export const importSchema = (
  text: string,
  options: { name: string; namesLocale?: Locale; fallbackLocale?: Locale; format?: ImportFormat; dialect?: DialectId },
): ImportResult => {
  const format = options.format ?? detectFormat(text);
  const ir = format === 'dbml' ? parseDbml(text) : parseSql(text);
  const dialect = options.dialect ?? ir.dialect ?? (format === 'sql' ? detectDialect(text) : 'postgresql');
  const { project, report } = irToProject(ir, { name: options.name, dialect, namesLocale: options.namesLocale, fallbackLocale: options.fallbackLocale });
  return { project, report, format, dialect };
};
