import { useEffect, useState } from 'react';
import type { RelationshipPreset } from '../../domain/model';
import { addRelationship } from '../../lib/actions';
import useUiStore from '../../stores/use-ui-store';
import useRegularEntities from './use-regular-entities';

export type Arity = 'binary' | 'nary';

/** State for the "new relationship" dialog. */
const useRelationshipForm = () => {
  const { open, entityIds: initial } = useUiStore((s) => s.relationshipDialog);
  const close = useUiStore((s) => s.closeRelationshipDialog);
  const entities = useRegularEntities();
  const [arity, setArity] = useState<Arity>('binary');
  const [preset, setPreset] = useState<RelationshipPreset>('1:N');
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const first = initial[0] ?? entities[0]?.id ?? '';
    const second = initial[1] ?? entities.find((e) => e.id !== first)?.id ?? first;
    setIds([first, second]);
    setArity('binary');
    setPreset('1:N');
    // Only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeArity = (value: Arity) => {
    setArity(value);
    if (value === 'nary' && ids.length < 3) {
      setIds([...ids, entities.find((e) => !ids.includes(e.id))?.id ?? entities[0]?.id ?? '']);
    }
    if (value === 'binary') setIds(ids.slice(0, 2));
  };

  const setAt = (index: number, id: string) => setIds(ids.map((current, i) => (i === index ? id : current)));
  const addSlot = () => setIds([...ids, entities[0]?.id ?? '']);
  const removeSlot = (index: number) => setIds(ids.filter((_, i) => i !== index));

  const create = () => {
    addRelationship(ids, arity === 'binary' ? preset : 'N:M');
    close();
  };

  return {
    open,
    close,
    entities,
    arity,
    changeArity,
    preset,
    setPreset,
    ids,
    setAt,
    addSlot,
    removeSlot,
    create,
    valid: ids.length >= 2 && ids.every(Boolean),
    recursive: arity === 'binary' && ids[0] === ids[1],
  };
};

export default useRelationshipForm;
