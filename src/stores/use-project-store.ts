import { t } from '../i18n';
import { create } from 'zustand';
import { createProject as newProject, syncJunctions, uid } from '../domain/model';
import type { DialectId, Project, ProjectMeta } from '../domain/types';
import * as db from '../lib/db';
import { createSampleProject } from '../lib/sample-project';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;
const SAVE_DELAY_MS = 400;

export type LoadStatus = 'loading' | 'ready' | 'error';
export type SaveStatus = 'saved' | 'saving' | 'error';

type ProjectState = {
  status: LoadStatus;
  error?: string;
  saveStatus: SaveStatus;
  projects: ProjectMeta[];
  project: Project | null;
  past: Project[];
  future: Project[];
  lastKey?: string;
  lastAt: number;

  init: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: (name: string, dialect: DialectId, databaseName?: string) => Promise<void>;
  /** Saves and opens a project built elsewhere, such as a generated random model. */
  addProject: (project: Project) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  importProject: (project: Project) => Promise<void>;
  /** Applies a change to the open project. Changes with the same key in quick succession share one undo step. */
  mutate: (change: (draft: Project) => void, key?: string) => void;
  undo: () => void;
  redo: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;

const LAST_OPEN_KEY = 'er-studio:last-project';

const rememberLastOpen = (id: string) => {
  try {
    localStorage.setItem(LAST_OPEN_KEY, id);
  } catch {
    /* storage may be unavailable */
  }
};

const readLastOpen = () => {
  try {
    return localStorage.getItem(LAST_OPEN_KEY);
  } catch {
    return null;
  }
};

const useProjectStore = create<ProjectState>((set, get) => {
  const scheduleSave = () => {
    set({ saveStatus: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { project } = get();
      if (!project) return;
      try {
        await db.saveProject(project);
        set({ saveStatus: 'saved', projects: await db.listProjects() });
      } catch {
        set({ saveStatus: 'error' });
      }
    }, SAVE_DELAY_MS);
  };

  const flushSave = async () => {
    clearTimeout(saveTimer);
    const { project, saveStatus } = get();
    if (project && saveStatus === 'saving') await db.saveProject(project);
  };

  const load = async (project: Project) => {
    await flushSave();
    rememberLastOpen(project.id);
    set({ project, past: [], future: [], lastKey: undefined, saveStatus: 'saved' });
  };

  const persistNew = async (project: Project) => {
    await db.saveProject(project);
    set({ projects: await db.listProjects() });
    await load(project);
  };

  return {
    status: 'loading',
    saveStatus: 'saved',
    projects: [],
    project: null,
    past: [],
    future: [],
    lastAt: 0,

    init: async () => {
      try {
        let projects = await db.listProjects();
        if (projects.length === 0) {
          await db.saveProject(createSampleProject());
          projects = await db.listProjects();
        }
        const lastId = readLastOpen();
        const id = projects.find((p) => p.id === lastId)?.id ?? projects[0].id;
        const project = await db.getProject(id);
        set({ projects, status: 'ready' });
        if (project) await load(project);
      } catch (error) {
        set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },

    openProject: async (id) => {
      if (get().project?.id === id) return;
      const project = await db.getProject(id);
      if (project) await load(project);
    },

    createProject: async (name, dialect, databaseName) => {
      const project = newProject(name, dialect);
      if (databaseName?.trim()) project.databaseName = databaseName.trim();
      await persistNew(project);
    },

    addProject: async (project) => persistNew(project),

    renameProject: async (id, name) => {
      const { project, mutate } = get();
      if (project?.id === id) {
        mutate((draft) => {
          draft.name = name;
        }, 'project-name');
        return;
      }
      const stored = await db.getProject(id);
      if (!stored) return;
      await db.saveProject({ ...stored, name, updatedAt: Date.now() });
      set({ projects: await db.listProjects() });
    },

    duplicateProject: async (id) => {
      await flushSave();
      const stored = await db.getProject(id);
      if (!stored) return;
      const now = Date.now();
      await persistNew({ ...structuredClone(stored), id: uid(), name: t('projects.copyName', { name: stored.name }), createdAt: now, updatedAt: now });
    },

    deleteProject: async (id) => {
      clearTimeout(saveTimer);
      await db.deleteProject(id);
      const projects = await db.listProjects();
      set({ projects });
      if (get().project?.id !== id) return;
      const next = projects[0] ? await db.getProject(projects[0].id) : undefined;
      if (next) await load(next);
      else set({ project: null, past: [], future: [] });
    },

    importProject: async (project) => persistNew(project),

    mutate: (change, key) => {
      const { project, past, lastKey, lastAt } = get();
      if (!project) return;
      const draft = structuredClone(project);
      change(draft);
      syncJunctions(draft);
      draft.updatedAt = Date.now();
      const now = Date.now();
      const coalesce = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS;
      set({
        project: draft,
        past: coalesce ? past : [...past, project].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: key,
        lastAt: now,
      });
      scheduleSave();
    },

    undo: () => {
      const { project, past, future } = get();
      const previous = past.at(-1);
      if (!project || !previous) return;
      set({ project: previous, past: past.slice(0, -1), future: [project, ...future], lastKey: undefined });
      scheduleSave();
    },

    redo: () => {
      const { project, past, future } = get();
      const [next, ...rest] = future;
      if (!project || !next) return;
      set({ project: next, past: [...past, project], future: rest, lastKey: undefined });
      scheduleSave();
    },
  };
});

export default useProjectStore;
