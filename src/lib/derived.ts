import { generateDdl, type DdlResult } from '../domain/ddl';
import { buildSchema } from '../domain/inference';
import { validateRecords, type RecordIssues } from '../domain/records';
import type { Issue, Project, Schema } from '../domain/types';
import { validateProject } from '../domain/validation';

export type Derived = { schema: Schema; issues: Issue[] };

const schemaCache = new WeakMap<Project, Derived>();
const ddlCache = new WeakMap<Project, DdlResult>();

/** Physical schema and issues for a project snapshot. Cached per immutable snapshot. */
export const getDerived = (project: Project): Derived => {
  const cached = schemaCache.get(project);
  if (cached) return cached;
  const schema = buildSchema(project);
  const derived = { schema, issues: validateProject(project, schema) };
  schemaCache.set(project, derived);
  return derived;
};

export const getDdl = (project: Project): DdlResult => {
  const cached = ddlCache.get(project);
  if (cached) return cached;
  const result = generateDdl(getDerived(project).schema, project.dialect, {
    projectName: project.name,
    databaseName: project.databaseName,
  });
  ddlCache.set(project, result);
  return result;
};

const recordCache = new WeakMap<Project, RecordIssues>();

/** Validation of the data rows of every table, cached per snapshot. */
export const getRecordIssues = (project: Project): RecordIssues => {
  const cached = recordCache.get(project);
  if (cached) return cached;
  const result = validateRecords(project, getDerived(project).schema);
  recordCache.set(project, result);
  return result;
};
