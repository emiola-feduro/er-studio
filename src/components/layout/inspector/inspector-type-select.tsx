import { TYPE_GROUP_KEYS } from '../../../lib/labels';
import useT from '../../../hooks/ui/use-t';
import { useMemo } from 'react';
import { DIALECTS, findType } from '../../../domain/dialects';
import type { Attribute } from '../../../domain/types';
import { updateAttribute } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

const CUSTOM = '__custom';

type InspectorTypeSelectProps = {
  entityId: string;
  attribute: Attribute;
};

const InspectorTypeSelect = ({ entityId, attribute }: InspectorTypeSelectProps) => {
  const t = useT();
  const dialectId = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const dialect = DIALECTS[dialectId];
  const { id, type } = attribute;
  const known = findType(dialect, type);

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of dialect.types) map.set(t.group, [...(map.get(t.group) ?? []), t.name]);
    return [...map.entries()];
  }, [dialect]);

  const onChange = (value: string) => {
    if (value === CUSTOM) {
      updateAttribute(entityId, id, { type: 'MI_TIPO', length: undefined, precision: undefined, scale: undefined });
      return;
    }
    const def = findType(dialect, value);
    updateAttribute(entityId, id, {
      type: value,
      enumValues: def?.generic === 'enum' ? (attribute.enumValues ?? []) : undefined,
      length: def?.params === 'length' ? def.defaultLength : undefined,
      precision: def?.params === 'precisionScale' ? def.defaultPrecision : undefined,
      scale: def?.params === 'precisionScale' ? def.defaultScale : undefined,
      autoIncrement: def?.integer ? attribute.autoIncrement : false,
    });
  };

  return (
    <>
      <label htmlFor={`attr-type-${id}`} className="sr-only">
        {t('attr.dataType')}
      </label>
      <select
        id={`attr-type-${id}`}
        className="field field-sm min-w-[5.5rem] flex-[0_1_7.5rem] pr-1"
        value={known ? known.name : CUSTOM}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map(([group, names]) => (
          <optgroup key={group} label={t(TYPE_GROUP_KEYS[group] ?? 'typeGroup.other')}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>{known ? t('attr.custom') : t('attr.customLabel', { type })}</option>
      </select>
    </>
  );
};

export default InspectorTypeSelect;
