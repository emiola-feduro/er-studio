import { Trash2 } from 'lucide-react';
import { DIALECTS } from '../../../domain/dialects';
import type { Table, TableIndex } from '../../../domain/types';
import { deleteIndex, updateIndex } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import Checkbox from '../../ui/checkbox/checkbox';
import IconButton from '../../ui/icon-button/icon-button';
import InspectorIndexColumns from './inspector-index-columns';

type InspectorIndexItemProps = {
  entityId: string;
  index: TableIndex;
  table: Table;
  resolvedName: string;
};

const InspectorIndexItem = ({ entityId, index, table, resolvedName }: InspectorIndexItemProps) => {
  const dialect = DIALECTS[useProjectStore((s) => s.project?.dialect ?? 'postgresql')];
  const { id, name, nameIsCustom, unique, method, where } = index;
  const update = (patch: Partial<TableIndex>, key?: string) => updateIndex(entityId, id, patch, key);

  return (
    <li className="space-y-3 rounded-theme border-(length:--bw) border-line p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`idx-name-${id}`} className="block font-medium">
            Nombre
          </label>
          <input
            id={`idx-name-${id}`}
            className="field field-sm font-canvas"
            value={nameIsCustom ? name : ''}
            placeholder={resolvedName}
            onChange={(e) => update({ name: e.target.value, nameIsCustom: e.target.value.trim() !== '' }, `idx-name:${id}`)}
          />
        </div>
        <IconButton label="Eliminar índice" tone="danger" size="sm" onClick={() => deleteIndex(entityId, id)} className="mb-0.5">
          <Trash2 size={15} />
        </IconButton>
      </div>
      <InspectorIndexColumns entityId={entityId} index={index} table={table} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Checkbox label="Único" checked={unique} onChange={(v) => update({ unique: v })} />
        {dialect.indexMethods.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor={`idx-method-${id}`} className="text-muted">
              Método
            </label>
            <select
              id={`idx-method-${id}`}
              className="field field-sm w-auto"
              value={method ?? ''}
              onChange={(e) => update({ method: e.target.value || undefined })}
            >
              <option value="">Por defecto</option>
              {dialect.indexMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {dialect.supportsPartialIndex && (
        <div className="space-y-1">
          <label htmlFor={`idx-where-${id}`} className="block font-medium">
            Condición WHERE (índice parcial)
          </label>
          <input
            id={`idx-where-${id}`}
            className="field field-sm font-canvas"
            placeholder="estado = 'activo'"
            value={where ?? ''}
            onChange={(e) => update({ where: e.target.value || undefined }, `idx-where:${id}`)}
          />
        </div>
      )}
    </li>
  );
};

export default InspectorIndexItem;
