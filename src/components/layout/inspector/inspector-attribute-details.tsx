import useT from '../../../hooks/ui/use-t';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { DIALECTS, findType } from '../../../domain/dialects';
import type { Attribute } from '../../../domain/types';
import { addIndex, moveAttribute, updateAttribute } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import Button from '../../ui/button/button';
import Checkbox from '../../ui/checkbox/checkbox';
import IconButton from '../../ui/icon-button/icon-button';
import InspectorDefaultField from './inspector-default-field';
import InspectorNumberField from './inspector-number-field';

type InspectorAttributeDetailsProps = {
  entityId: string;
  attribute: Attribute;
  isFirst: boolean;
  isLast: boolean;
};

const InspectorAttributeDetails = ({ entityId, attribute, isFirst, isLast }: InspectorAttributeDetailsProps) => {
  const t = useT();
  const dialectId = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const { id, type, length, precision, scale, pk, nullable, unique, autoIncrement, check } = attribute;
  const def = findType(DIALECTS[dialectId], type);
  const update = (patch: Partial<Attribute>) => updateAttribute(entityId, id, patch);

  return (
    <div className="space-y-3 px-2 pt-2 pb-3">
      {!def && (
        <div className="space-y-1">
          <label htmlFor={`attr-custom-${id}`} className="block font-medium">
            {t('attr.customType')}
          </label>
          <input id={`attr-custom-${id}`} className="field field-sm" value={type} onChange={(e) => update({ type: e.target.value })} />
        </div>
      )}
      {!def && (
        <InspectorNumberField id={`attr-len-${id}`} label={t('attr.lengthOptional')} value={length} onChange={(v) => update({ length: v })} />
      )}
      {def?.params === 'precisionScale' && (
        <div className="grid grid-cols-2 gap-2">
          <InspectorNumberField id={`attr-p-${id}`} label={t('attr.precision')} value={precision} onChange={(v) => update({ precision: v })} />
          <InspectorNumberField id={`attr-s-${id}`} label={t('attr.scale')} value={scale} onChange={(v) => update({ scale: v })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Checkbox label={t('attr.primaryKey')} checked={pk} onChange={(v) => update({ pk: v })} />
        <Checkbox label={t('attr.notNull')} checked={!nullable || pk} disabled={pk} onChange={(v) => update({ nullable: !v })} />
        <Checkbox label={t('attr.unique')} checked={unique} disabled={pk} onChange={(v) => update({ unique: v })} />
        <Checkbox
          label={t('attr.autoIncrement')}
          checked={autoIncrement}
          disabled={!def?.integer && !autoIncrement}
          title={def?.integer ? undefined : t('attr.integerOnly')}
          onChange={(v) => update({ autoIncrement: v })}
        />
      </div>
      <InspectorDefaultField id={id} dialect={dialectId} attribute={attribute} onChange={(v) => update({ defaultValue: v })} />
      <div className="space-y-1">
        <label htmlFor={`attr-check-${id}`} className="block font-medium">
          {t('attr.check')}
        </label>
        <input
          id={`attr-check-${id}`}
          className="field field-sm font-canvas"
          placeholder={t('attr.checkPlaceholder')}
          value={check ?? ''}
          onChange={(e) => update({ check: e.target.value || undefined })}
        />
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={t('common.moveUp')} size="sm" disabled={isFirst} onClick={() => moveAttribute(entityId, id, -1)}>
          <ArrowUp size={15} />
        </IconButton>
        <IconButton label={t('common.moveDown')} size="sm" disabled={isLast} onClick={() => moveAttribute(entityId, id, 1)}>
          <ArrowDown size={15} />
        </IconButton>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => addIndex(entityId, id)}>
          {t('attr.createIndex')}
        </Button>
      </div>
    </div>
  );
};

export default InspectorAttributeDetails;
