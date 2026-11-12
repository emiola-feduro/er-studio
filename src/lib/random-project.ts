import { buildSchema } from '../domain/inference';
import { fillRandomRecords, generateRandomModel } from '../domain/random-model';
import type { DialectId, Project } from '../domain/types';
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
};

/** A random model already laid out, optionally with random rows in every table. */
export const createRandomProject = ({ name, dialect, databaseName, entityCount, themeId, recordCount }: RandomProjectOptions): Project => {
  const project = generateRandomModel({ dialect, entityCount, themeId });
  const positions = layoutSchema(buildSchema(project));
  for (const entity of project.entities) entity.position = positions.get(entity.id) ?? entity.position;
  if (recordCount > 0) fillRandomRecords(project, recordCount);
  project.name = name.trim() || project.name;
  if (databaseName?.trim()) project.databaseName = databaseName.trim();
  return project;
};
