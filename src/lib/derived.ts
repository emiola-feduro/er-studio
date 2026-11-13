import { generateDdl, type DdlResult } from '../domain/ddl';
import { buildSchema } from '../domain/inference';
import { validateRecords, type RecordIssues } from '../domain/records';
import type { Issue, Project, Schema } from '../domain/types';
import { getLocale, type Locale } from '../i18n';
import { validateProject } from '../domain/validation';

export type Derived = { schema: Schema; issues: Issue[] };

/** Messages are written in the current language, so every cache is kept per language. */
const perLocale = <T,>() => {
  const caches = new Map<Locale, WeakMap<Project, T>>();
  return () => {
    const locale = getLocale();
    if (!caches.has(locale)) caches.set(locale, new WeakMap());
    return caches.get(locale)!;
  };
};

const schemaCaches = perLocale<Derived>();
const ddlCaches = perLocale<DdlResult>();
const recordCaches = perLocale<RecordIssues>();

/** Physical schema and issues for a project snapshot. Cached per immutable snapshot. */
export const getDerived = (project: Project): Derived => {
  const schemaCache = schemaCaches();
  const cached = schemaCache.get(project);
  if (cached) return cached;
  const schema = buildSchema(project);
  const derived = { schema, issues: validateProject(project, schema) };
  schemaCache.set(project, derived);
  return derived;
};

export const getDdl = (project: Project): DdlResult => {
  const ddlCache = ddlCaches();
  const cached = ddlCache.get(project);
  if (cached) return cached;
  const result = generateDdl(getDerived(project).schema, project.dialect, {
    projectName: project.name,
    databaseName: project.databaseName,
  });
  ddlCache.set(project, result);
  return result;
};


/** Validation of the data rows of every table, cached per snapshot. */
export const getRecordIssues = (project: Project): RecordIssues => {
  const recordCache = recordCaches();
  const cached = recordCache.get(project);
  if (cached) return cached;
  const result = validateRecords(project, getDerived(project).schema);
  recordCache.set(project, result);
  return result;
};
