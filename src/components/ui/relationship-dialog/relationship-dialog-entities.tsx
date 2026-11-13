import useT from '../../../hooks/ui/use-t';
import type useRelationshipForm from '../../../hooks/model/use-relationship-form';
import Button from '../button/button';

type RelationshipForm = ReturnType<typeof useRelationshipForm>;

const RelationshipDialogEntities = ({ form }: { form: RelationshipForm }) => {
  const t = useT();
  const { ids, entities, arity, setAt, addSlot, removeSlot } = form;

  return (
    <div className="space-y-2">
      {ids.map((id, index) => (
        <div key={index} className="flex items-center gap-2">
          <label className="w-24 shrink-0 text-muted" htmlFor={`rel-entity-${index}`}>
            {t('relDialog.entityN', { index: index + 1 })}
          </label>
          <select id={`rel-entity-${index}`} className="field" value={id} onChange={(event) => setAt(index, event.target.value)}>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
          {arity === 'nary' && ids.length > 3 && (
            <Button size="sm" variant="ghost" onClick={() => removeSlot(index)}>
              {t('relDialog.remove')}
            </Button>
          )}
        </div>
      ))}
      {arity === 'nary' && (
        <Button size="sm" variant="ghost" onClick={addSlot}>
          {t('relDialog.addEntity')}
        </Button>
      )}
    </div>
  );
};

export default RelationshipDialogEntities;
