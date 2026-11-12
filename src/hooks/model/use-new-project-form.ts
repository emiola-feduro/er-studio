import { useState, type FormEvent } from 'react';
import { maxEntities, MIN_ENTITIES, THEMES } from '../../domain/random-model';
import type { DialectId } from '../../domain/types';
import { createRandomProject } from '../../lib/random-project';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

export type StartWith = 'empty' | 'random';

const DEFAULT_NAME = 'Nuevo proyecto';
export const MAX_RECORDS = 500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value) || min));

/** State and submit of the new project dialog, empty or with a random model. */
const useNewProjectForm = (onDone: () => void) => {
  const createProject = useProjectStore((s) => s.createProject);
  const addProject = useProjectStore((s) => s.addProject);
  const [name, setName] = useState(DEFAULT_NAME);
  const [nameTouched, setNameTouched] = useState(false);
  const [dialect, setDialect] = useState<DialectId>('postgresql');
  const [databaseName, setDatabaseName] = useState('');
  // Kept in the UI store so other places can open the dialog on a random model.
  const startWith = useUiStore((s) => s.newProjectStart);
  const setStartWith = useUiStore((s) => s.setNewProjectStart);
  const [themeId, setThemeId] = useState('');
  const [entityCount, setEntityCount] = useState(5);
  const [withRecords, setWithRecords] = useState(true);
  const [recordCount, setRecordCount] = useState(20);
  const [busy, setBusy] = useState(false);

  const maxCount = maxEntities(themeId || undefined);
  const random = startWith === 'random';

  const reset = () => {
    setName(DEFAULT_NAME);
    setNameTouched(false);
    setDatabaseName('');
    setBusy(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (random) {
        const project = createRandomProject({
          // Without a custom name the project takes the theme name, which says more than "Nuevo proyecto".
          name: nameTouched ? name : '',
          dialect,
          databaseName,
          themeId: themeId || undefined,
          entityCount: clamp(entityCount, MIN_ENTITIES, maxCount),
          recordCount: withRecords ? clamp(recordCount, 1, MAX_RECORDS) : 0,
        });
        await addProject(project);
        useUiStore.getState().setView('diagram');
      } else {
        await createProject(name.trim(), dialect, databaseName);
      }
      useUiStore.getState().select(null);
      onDone();
      reset();
    } catch {
      setBusy(false);
      useUiStore.getState().notify('No se pudo crear el proyecto.', 'error');
    }
  };

  return {
    fields: {
      name,
      setName: (value: string) => {
        setName(value);
        setNameTouched(true);
      },
      dialect,
      setDialect,
      databaseName,
      setDatabaseName,
      startWith,
      setStartWith,
    },
    random: {
      themes: THEMES,
      themeId,
      setThemeId,
      entityCount,
      setEntityCount,
      minCount: MIN_ENTITIES,
      maxCount,
      withRecords,
      setWithRecords,
      recordCount,
      setRecordCount,
    },
    busy,
    submit,
  };
};

export default useNewProjectForm;
