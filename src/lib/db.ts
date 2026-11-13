import Dexie, { type Table } from 'dexie';
import type { ModelVersion, Project, ProjectMeta } from '../domain/types';

class ErStudioDb extends Dexie {
  projects!: Table<Project, string>;
  versions!: Table<ModelVersion, string>;

  constructor() {
    super('er-studio');
    this.version(1).stores({ projects: 'id, updatedAt' });
    this.version(2).stores({ projects: 'id, updatedAt', versions: 'id, projectId, createdAt' });
  }
}

export const db = new ErStudioDb();

export const toMeta = (project: Project): ProjectMeta => ({
  id: project.id,
  name: project.name,
  dialect: project.dialect,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  tableCount: project.entities.length,
});

export const listProjects = async (): Promise<ProjectMeta[]> => {
  const all = await db.projects.orderBy('updatedAt').reverse().toArray();
  return all.map(toMeta);
};

export const getProject = (id: string) => db.projects.get(id);

export const saveProject = (project: Project) => db.projects.put(project);

export const deleteProject = (id: string) =>
  db.transaction('rw', db.projects, db.versions, async () => {
    await db.projects.delete(id);
    await db.versions.where('projectId').equals(id).delete();
  });

/* Model versions */

export const listVersions = (projectId: string) => db.versions.where('projectId').equals(projectId).reverse().sortBy('createdAt');

export const saveVersion = (version: ModelVersion) => db.versions.put(version);

export const deleteVersion = (id: string) => db.versions.delete(id);
