import { ArrowDown, ArrowUp } from 'lucide-react';
import { DIALECTS, findType } from '../../../domain/dialects';
import type { Attribute } from '../../../domain/types';
import { addIndex, moveAttribute, updateAttribute } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import Button from '../../ui/button/button';
import Checkbox from '../../ui/checkbox/checkbox';
import IconButton from '../../ui/icon-button/icon-button';
import InspectorNumberField from './inspector-number-field';

type InspectorAttributeDetailsProps = {
  entityId: string;
  attribute: Attribute;
  isFirst: boolean;
  isLast: boolean;
};

const InspectorAttributeDetails = ({ entityId, attribute, isFirst, isLast }: InspectorAttributeDetailsProps) => {
  const dialectId = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const { id, type, length, precision, scale, pk, nullable, unique, autoIncrement, defaultValue, check } = attribute;
  const def = findType(DIALECTS[dialectId], type);
  const update = (patch: Partial<Attribute>) => updateAttribute(entityId, id, patch);

  return (
    <div className="space-y-3 px-2 pt-2 pb-3">
      {!def && (
        <div className="space-y-1">
          <label htmlFor={`attr-custom-${id}`} className="block font-medium">
            Tipo personalizado
          </label>
          <input id={`attr-custom-${id}`} className="field field-sm" value={type} onChange={(e) => update({ type: e.target.value })} />
        </div>
      )}
      {!def && (
        <InspectorNumberField id={`attr-len-${id}`} label="Longitud (opcional)" value={length} onChange={(v) => update({ length: v })} />
      )}
      {def?.params === 'precisionScale' && (
        <div className="grid grid-cols-2 gap-2">
          <InspectorNumberField id={`attr-p-${id}`} label="Precisión" value={precision} onChange={(v) => update({ precision: v })} />
          <InspectorNumberField id={`attr-s-${id}`} label="Escala" value={scale} onChange={(v) => update({ scale: v })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Checkbox label="Llave primaria" checked={pk} onChange={(v) => update({ pk: v })} />
        <Checkbox label="No nulo" checked={!nullable || pk} disabled={pk} onChange={(v) => update({ nullable: !v })} />
        <Checkbox label="Único" checked={unique} disabled={pk} onChange={(v) => update({ unique: v })} />
        <Checkbox
          label="Autoincremental"
          checked={autoIncrement}
          disabled={!def?.integer && !autoIncrement}
          title={def?.integer ? undefined : 'Solo para tipos enteros'}
          onChange={(v) => update({ autoIncrement: v })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`attr-default-${id}`} className="block font-medium">
          Valor por defecto
        </label>
        <input
          id={`attr-default-${id}`}
          className="field field-sm font-canvas"
          placeholder="'activo', 0, CURRENT_TIMESTAMP"
          value={defaultValue ?? ''}
          onChange={(e) => update({ defaultValue: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`attr-check-${id}`} className="block font-medium">
          Restricción CHECK
        </label>
        <input
          id={`attr-check-${id}`}
          className="field field-sm font-canvas"
          placeholder="precio >= 0"
          value={check ?? ''}
          onChange={(e) => update({ check: e.target.value || undefined })}
        />
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Subir" size="sm" disabled={isFirst} onClick={() => moveAttribute(entityId, id, -1)}>
          <ArrowUp size={15} />
        </IconButton>
        <IconButton label="Bajar" size="sm" disabled={isLast} onClick={() => moveAttribute(entityId, id, 1)}>
          <ArrowDown size={15} />
        </IconButton>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => addIndex(entityId, id)}>
          Crear índice sobre esta columna
        </Button>
      </div>
    </div>
  );
};

export default InspectorAttributeDetails;
