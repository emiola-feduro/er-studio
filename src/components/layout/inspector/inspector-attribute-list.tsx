import type { Entity } from '../../../domain/types';
import { addAttribute } from '../../../lib/actions';
import Button from '../../ui/button/button';
import InspectorAttributeRow from './inspector-attribute-row';
import InspectorSection from './inspector-section';

const InspectorAttributeList = ({ entity }: { entity: Entity }) => {
  const { id, attributes, kind } = entity;

  return (
    <InspectorSection
      title={kind === 'junction' ? 'Atributos propios' : 'Atributos'}
      action={
        <Button size="sm" onClick={() => addAttribute(id)}>
          Añadir atributo
        </Button>
      }
    >
      {attributes.length === 0 ? (
        <p className="text-muted">Sin atributos propios</p>
      ) : (
        <ul className="space-y-1.5">
          {attributes.map((attribute, index) => (
            <InspectorAttributeRow
              key={attribute.id}
              entityId={id}
              attribute={attribute}
              isFirst={index === 0}
              isLast={index === attributes.length - 1}
            />
          ))}
        </ul>
      )}
    </InspectorSection>
  );
};

export default InspectorAttributeList;
