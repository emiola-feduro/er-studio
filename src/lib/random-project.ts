import { buildSchema } from '../domain/inference';
import { fillRandomRecords, generateRandomModel } from '../domain/random-model';
import type { DialectId, Project } from '../domain/types';
import type { Locale } from '../i18n';
import { layoutSchema } from './layout';

export type RandomProjectOptions = {
  name: string;
  dialect: DialectId;
  databaseName?: string;
  entityCount: number;
  /** Undefined picks a theme at random. */
  themeId?: string;
  /** Rows per table, or 0 for none. */
  recordCount: number;
  /** Language of table, column and sample data names. */
  namesLocale: Locale;
};

/** A random model already laid out, optionally with random rows in every table. */
export const createRandomProject = ({ name, dialect, databaseName, entityCount, themeId, recordCount, namesLocale }: RandomProjectOptions): Project => {
  const project = generateRandomModel({ dialect, entityCount, themeId, namesLocale });
  const positions = layoutSchema(buildSchema(project));
  for (const entity of project.entities) entity.position = positions.get(entity.id) ?? entity.position;
  if (recordCount > 0) fillRandomRecords(project, recordCount, Math.random, namesLocale);
  project.name = name.trim() || project.name;
  if (databaseName?.trim()) project.databaseName = databaseName.trim();
  return project;
};
