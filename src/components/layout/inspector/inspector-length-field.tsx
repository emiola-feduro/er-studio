import { DIALECTS, findType, maxLengthFor } from '../../../domain/dialects';
import type { Attribute } from '../../../domain/types';
import { updateAttribute } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

type InspectorLengthFieldProps = {
  entityId: string;
  attribute: Attribute;
};

/** Inline character limit for CHAR, VARCHAR and similar types. */
const InspectorLengthField = ({ entityId, attribute }: InspectorLengthFieldProps) => {
  const dialectId = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const { id, name, type, length } = attribute;
  const def = findType(DIALECTS[dialectId], type);
  if (def?.params !== 'length') return null;
  const max = maxLengthFor(dialectId, type);
  const invalid = length != null && (length < 1 || (max != null && length > max));

  return (
    <>
      <label htmlFor={`attr-limit-${id}`} className="sr-only">
        Límite de caracteres de {name}
      </label>
      <input
        id={`attr-limit-${id}`}
        type="number"
        min={1}
        max={max}
        inputMode="numeric"
        title={max ? `Límite de caracteres (máximo ${max})` : 'Límite de caracteres'}
        aria-invalid={invalid}
        placeholder={String(def.defaultLength ?? '')}
        className={`field field-sm w-[4.25rem] shrink-0 px-1.5 tabular-nums ${invalid ? 'border-danger!' : ''}`}
        value={length ?? ''}
        onChange={(e) =>
          updateAttribute(entityId, id, { length: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })
        }
      />
    </>
  );
};

export default InspectorLengthField;
