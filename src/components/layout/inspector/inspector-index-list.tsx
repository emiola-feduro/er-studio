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
  const { id, indexes } = entity;

  return (
    <InspectorSection
      title="Índices"
      action={
        <Button size="sm" onClick={() => addIndex(id)}>
          Añadir índice
        </Button>
      }
    >
      {indexes.length === 0 ? (
        <p className="text-muted">Sin índices</p>
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
