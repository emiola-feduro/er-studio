import { buildSchema } from '../domain/inference';
import { importSchema, type ImportFormat, type ImportResult } from '../domain/import';
import type { DialectId } from '../domain/types';
import type { Locale } from '../i18n';
import { layoutSchema } from './layout';

/** Reads a DDL or DBML and lays the diagram out, ready to save as a new project. */
export const importProjectFrom = (
  text: string,
  options: { name: string; namesLocale?: Locale; fallbackLocale?: Locale; format?: ImportFormat; dialect?: DialectId },
): ImportResult => {
  const result = importSchema(text, options);
  const positions = layoutSchema(buildSchema(result.project));
  for (const entity of result.project.entities) entity.position = positions.get(entity.id) ?? entity.position;
  return result;
};
