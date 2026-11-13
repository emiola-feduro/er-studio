import useT from '../../../hooks/ui/use-t';
import type { Entity } from '../../../domain/types';
import { addAttribute } from '../../../lib/actions';
import Button from '../../ui/button/button';
import InspectorAttributeRow from './inspector-attribute-row';
import InspectorSection from './inspector-section';

const InspectorAttributeList = ({ entity }: { entity: Entity }) => {
  const t = useT();
  const { id, attributes, kind } = entity;

  return (
    <InspectorSection
      title={kind === 'junction' ? t('entity.ownAttributes') : t('entity.attributes')}
      action={
        <Button size="sm" onClick={() => addAttribute(id)}>
          {t('entity.addAttribute')}
        </Button>
      }
    >
      {attributes.length === 0 ? (
        <p className="text-muted">{t('entity.noOwnAttributes')}</p>
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
