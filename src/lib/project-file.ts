import { t } from '../i18n';
import { DIALECTS } from '../domain/dialects';
import { syncJunctions, uid } from '../domain/model';
import type { Project } from '../domain/types';
import { saveBlob } from './platform';

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
    throw new Error(t('file.invalidJson'));
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
    throw new Error(t('file.notAProject'));
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
  return downloadBlob(filename, blob);
};

export const downloadBlob = (filename: string, blob: Blob) => saveBlob(filename, blob);

export const downloadDataUrl = async (filename: string, dataUrl: string) => saveBlob(filename, await (await fetch(dataUrl)).blob());

export const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'proyecto';
