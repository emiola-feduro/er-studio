import Dexie, { type Table } from 'dexie';
import type { Project, ProjectMeta } from '../domain/types';

class ErStudioDb extends Dexie {
  projects!: Table<Project, string>;

  constructor() {
    super('er-studio');
    this.version(1).stores({ projects: 'id, updatedAt' });
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

export const deleteProject = (id: string) => db.projects.delete(id);
