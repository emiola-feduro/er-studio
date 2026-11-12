import type useNewProjectForm from '../../../hooks/model/use-new-project-form';
import { MAX_RECORDS } from '../../../hooks/model/use-new-project-form';
import Checkbox from '../checkbox/checkbox';

type RandomFields = ReturnType<typeof useNewProjectForm>['random'];

const NewProjectDialogRandomFields = ({ random }: { random: RandomFields }) => {
  const { themes, themeId, setThemeId, entityCount, setEntityCount, minCount, maxCount, withRecords, setWithRecords, recordCount, setRecordCount } =
    random;

  return (
    <div className="space-y-4 rounded-theme border-(length:--bw) border-line bg-surface-2 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="random-theme" className="block font-medium">
            Tema
          </label>
          <select id="random-theme" className="field" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">Al azar</option>
            {themes.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="random-entities" className="block font-medium">
            Entidades
          </label>
          <input
            id="random-entities"
            type="number"
            className="field tabular-nums"
            min={minCount}
            max={maxCount}
            value={entityCount}
            onChange={(e) => setEntityCount(e.target.valueAsNumber)}
            aria-describedby="random-entities-range"
          />
          <span id="random-entities-range" className="block text-[0.9em] text-muted">
            Entre {minCount} y {maxCount}
          </span>
        </div>
      </div>
      <Checkbox label="Generar registros aleatorios" checked={withRecords} onChange={setWithRecords} />
      {withRecords && (
        <div className="space-y-1.5">
          <label htmlFor="random-records" className="block font-medium">
            Registros por tabla
          </label>
          <input
            id="random-records"
            type="number"
            className="field w-32 tabular-nums"
            min={1}
            max={MAX_RECORDS}
            value={recordCount}
            onChange={(e) => setRecordCount(e.target.valueAsNumber)}
            aria-describedby="random-records-range"
          />
          <span id="random-records-range" className="block text-[0.9em] text-muted">
            Máximo {MAX_RECORDS}
          </span>
        </div>
      )}
    </div>
  );
};

export default NewProjectDialogRandomFields;
