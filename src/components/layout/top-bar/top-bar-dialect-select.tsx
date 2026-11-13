import useT from '../../../hooks/ui/use-t';
import { DIALECT_LIST } from '../../../domain/dialects';
import type { DialectId } from '../../../domain/types';
import { setDialect } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const TopBarDialectSelect = () => {
  const t = useT();
  const dialect = useProjectStore((s) => s.project?.dialect);
  if (!dialect) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dialect" className="text-muted">
        {t('topBar.dialect')}
      </label>
      <select id="dialect" className="field field-sm w-auto" value={dialect} onChange={(event) => setDialect(event.target.value as DialectId)}>
        {DIALECT_LIST.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TopBarDialectSelect;
