import { DIALECT_LIST } from '../../../domain/dialects';
import type { DialectId } from '../../../domain/types';
import useNewProjectForm, { type StartWith } from '../../../hooks/model/use-new-project-form';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';
import NewProjectDialogRandomFields from './new-project-dialog-random-fields';

const NewProjectDialog = () => {
  const open = useUiStore((s) => s.newProjectOpen);
  const setOpen = useUiStore((s) => s.setNewProjectOpen);
  const { fields, random, busy, submit } = useNewProjectForm(() => setOpen(false));
  const { name, setName, dialect, setDialect, databaseName, setDatabaseName, startWith, setStartWith } = fields;

  return (
    <Modal title="Nuevo proyecto" open={open} onClose={() => setOpen(false)} width="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="new-project-name" className="block font-medium">
            Nombre
          </label>
          <input id="new-project-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="new-project-dialect" className="block font-medium">
              Gestor de base de datos
            </label>
            <select id="new-project-dialect" className="field" value={dialect} onChange={(e) => setDialect(e.target.value as DialectId)}>
              {DIALECT_LIST.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-project-database" className="block font-medium">
              Base de datos (opcional)
            </label>
            <input
              id="new-project-database"
              className="field"
              value={databaseName}
              spellCheck={false}
              onChange={(e) => setDatabaseName(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="block font-medium">
            Empezar con
          </span>
          <SegmentedControl<StartWith>
            label="Empezar con"
            value={startWith}
            onChange={setStartWith}
            options={[
              { value: 'empty', label: 'Diagrama vacío' },
              { value: 'random', label: 'Modelo aleatorio' },
            ]}
          />
        </div>
        {startWith === 'random' && <NewProjectDialogRandomFields random={random} />}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {startWith === 'random' ? 'Generar proyecto' : 'Crear proyecto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default NewProjectDialog;
