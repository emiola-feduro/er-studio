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
  const { id, name, pk } = attribute;
  const [expanded, setExpanded] = useState(false);

  return (
    <li className={`rounded-[calc(var(--radius)*0.75)] ${expanded ? 'bg-surface-2' : ''}`}>
      <div className="flex items-center gap-1">
        <IconButton
          label={expanded ? `Ocultar detalles de ${name}` : `Mostrar detalles de ${name}`}
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
          Nombre del atributo
        </label>
        <input
          id={`attr-name-${id}`}
          className="field field-sm min-w-0 flex-1 basis-20"
          value={name}
          onChange={(e) => updateAttribute(entityId, id, { name: e.target.value })}
        />
        <InspectorTypeSelect entityId={entityId} attribute={attribute} />
        <InspectorLengthField entityId={entityId} attribute={attribute} />
        <IconButton label={`Eliminar ${name}`} tone="danger" size="sm" onClick={() => deleteAttribute(entityId, id)}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      {isEnum(attribute.type) && <InspectorEnumValues entityId={entityId} attribute={attribute} />}
      {expanded && <InspectorAttributeDetails entityId={entityId} attribute={attribute} isFirst={isFirst} isLast={isLast} />}
    </li>
  );
};

export default InspectorAttributeRow;
