import { buildSchema } from '../domain/inference';
import { importIr, importSchema, type ImportFormat, type ImportResult } from '../domain/import';
import type { Ir } from '../domain/import/ir';
import type { DialectId } from '../domain/types';
import type { Locale } from '../i18n';
import { layoutSchema } from './layout';

type ImportOptions = { name: string; namesLocale?: Locale; fallbackLocale?: Locale; format?: ImportFormat; dialect?: DialectId };

const layOut = (result: ImportResult) => {
  const positions = layoutSchema(buildSchema(result.project));
  for (const entity of result.project.entities) entity.position = positions.get(entity.id) ?? entity.position;
  return result;
};

/** Reads a DDL or DBML and lays the diagram out, ready to save as a new project. */
export const importProjectFrom = (text: string, options: ImportOptions): ImportResult => layOut(importSchema(text, options));

/** Same for a schema already read from a database file. */
export const importProjectFromIr = (ir: Ir, format: ImportFormat, options: ImportOptions): ImportResult => layOut(importIr(ir, format, options));
