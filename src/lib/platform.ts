// What differs between the web build and the desktop (Tauri) build lives here, so the rest of the app never checks the platform.
import { isTauri } from '@tauri-apps/api/core';

export const isDesktop = () => isTauri();

const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1) : '';
};

const browserDownload = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Desktop webviews do not handle <a download> consistently, so the desktop build asks where to save and writes the file itself.
const desktopSave = async (filename: string, blob: Blob) => {
  const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  const extension = extensionOf(filename);
  const path = await save({ defaultPath: filename, filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [] });
  if (!path) return;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
};

export const saveBlob = async (filename: string, blob: Blob) => {
  if (isDesktop()) await desktopSave(filename, blob);
  else browserDownload(filename, blob);
};
