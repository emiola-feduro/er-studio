import { useCallback, useRef } from 'react';
import { parseProjectFile } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

/** Opens a file picker and imports a project exported as JSON. */
const useImportProject = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const { notify } = useUiStore.getState();
    try {
      const project = parseProjectFile(await file.text());
      await useProjectStore.getState().importProject(project);
      notify(`Proyecto "${project.name}" importado.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo importar el archivo.', 'error');
    }
  }, []);

  const pick = useCallback(() => {
    if (!inputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        void onFile(input.files?.[0]);
        input.value = '';
      });
      inputRef.current = input;
    }
    inputRef.current.click();
  }, [onFile]);

  return pick;
};

export default useImportProject;
