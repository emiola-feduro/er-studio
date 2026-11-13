import useT from '../../../hooks/ui/use-t';
import type { Entity, Table } from '../../../domain/types';
import { addIndex } from '../../../lib/actions';
import Button from '../../ui/button/button';
import InspectorIndexItem from './inspector-index-item';
import InspectorSection from './inspector-section';

type InspectorIndexListProps = {
  entity: Entity;
  table: Table;
};

const InspectorIndexList = ({ entity, table }: InspectorIndexListProps) => {
  const t = useT();
  const { id, indexes } = entity;

  return (
    <InspectorSection
      title={t('index.title')}
      action={
        <Button size="sm" onClick={() => addIndex(id)}>
          {t('index.add')}
        </Button>
      }
    >
      {indexes.length === 0 ? (
        <p className="text-muted">{t('index.none')}</p>
      ) : (
        <ul className="space-y-3">
          {indexes.map((index) => (
            <InspectorIndexItem
              key={index.id}
              entityId={id}
              index={index}
              table={table}
              resolvedName={table.indexes.find((i) => i.id === index.id)?.name ?? ''}
            />
          ))}
        </ul>
      )}
    </InspectorSection>
  );
};

export default InspectorIndexList;
