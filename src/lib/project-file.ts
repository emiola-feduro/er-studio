import { DIALECTS } from '../domain/dialects';
import { syncJunctions, uid } from '../domain/model';
import type { Project } from '../domain/types';

const FORMAT = 'er-studio';
const VERSION = 1;

export const serializeProject = (project: Project) =>
  JSON.stringify({ format: FORMAT, version: VERSION, project }, null, 2);

/** Parses an exported file. Always returns a project with a fresh id so imports never overwrite. */
export const parseProjectFile = (text: string): Project => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }
  const wrapper = data as { format?: string; project?: Project };
  const project = wrapper?.format === FORMAT ? wrapper.project : (data as Project);
  if (
    !project ||
    typeof project.name !== 'string' ||
    !Array.isArray(project.entities) ||
    !Array.isArray(project.relationships) ||
    !(project.dialect in DIALECTS)
  ) {
    throw new Error('El archivo no tiene el formato de un proyecto de ER Studio.');
  }
  const now = Date.now();
  const imported: Project = {
    ...project,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    entities: project.entities.map((e) => ({ ...e, indexes: e.indexes ?? [], attributes: e.attributes ?? [] })),
    records: project.records && typeof project.records === 'object' ? project.records : {},
  };
  syncJunctions(imported);
  return imported;
};

export const downloadText = (filename: string, text: string, mime: string) => {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
};

export const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadDataUrl = (filename: string, dataUrl: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

export const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'proyecto';
