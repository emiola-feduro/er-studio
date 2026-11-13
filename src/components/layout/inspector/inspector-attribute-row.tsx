import useT from '../../../hooks/ui/use-t';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Attribute } from '../../../domain/types';
import { deleteAttribute, updateAttribute } from '../../../lib/actions';
import IconButton from '../../ui/icon-button/icon-button';
import { isEnum } from '../../../domain/dialects';
import InspectorAttributeDetails from './inspector-attribute-details';
import InspectorEnumValues from './inspector-enum-values';
import InspectorLengthField from './inspector-length-field';
import InspectorTypeSelect from './inspector-type-select';

type InspectorAttributeRowProps = {
  entityId: string;
  attribute: Attribute;
  isFirst: boolean;
  isLast: boolean;
};

const InspectorAttributeRow = ({ entityId, attribute, isFirst, isLast }: InspectorAttributeRowProps) => {
  const t = useT();
  const { id, name, pk } = attribute;
  const [expanded, setExpanded] = useState(false);

  return (
    <li className={`rounded-[calc(var(--radius)*0.75)] ${expanded ? 'bg-surface-2' : ''}`}>
      {/* Wraps instead of squeezing the name: the name field never gets narrower than its minimum. */}
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          label={expanded ? t('attr.hideDetails', { name }) : t('attr.showDetails', { name })}
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>
        <span className={`w-5 shrink-0 text-[0.75em] font-bold ${pk ? 'text-pk' : 'text-transparent'}`} aria-hidden={!pk}>
          PK
        </span>
        <label htmlFor={`attr-name-${id}`} className="sr-only">
          {t('attr.name')}
        </label>
        <input
          id={`attr-name-${id}`}
          className="field field-sm min-w-[6rem] flex-[999_1_6rem]"
          value={name}
          onChange={(e) => updateAttribute(entityId, id, { name: e.target.value })}
        />
        <div className="ml-auto flex flex-[1_1_auto] items-center justify-end gap-1">
          <InspectorTypeSelect entityId={entityId} attribute={attribute} />
          <InspectorLengthField entityId={entityId} attribute={attribute} />
          <IconButton label={t('attr.delete', { name })} tone="danger" size="sm" onClick={() => deleteAttribute(entityId, id)}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
      {isEnum(attribute.type) && <InspectorEnumValues entityId={entityId} attribute={attribute} />}
      {expanded && <InspectorAttributeDetails entityId={entityId} attribute={attribute} isFirst={isFirst} isLast={isLast} />}
    </li>
  );
};

export default InspectorAttributeRow;
