import useT from '../../../hooks/ui/use-t';
import { useState } from 'react';
import { addRandomRows } from '../../../lib/actions';
import Button from '../button/button';

/** Generates several rows with random values at once. */
const RecordsViewGenerate = ({ tableId }: { tableId: string }) => {
  const t = useT();
  const [count, setCount] = useState(5);
  const valid = Number.isInteger(count) && count >= 1 && count <= 500;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="random-count" className="sr-only">
        {t('records.randomCount')}
      </label>
      <input
        id="random-count"
        type="number"
        min={1}
        max={500}
        value={Number.isNaN(count) ? '' : count}
        onChange={(e) => setCount(e.target.valueAsNumber)}
        className="field field-sm w-16 tabular-nums"
      />
      <Button size="sm" disabled={!valid} onClick={() => addRandomRows(tableId, count)}>
        {t('records.generate')}
      </Button>
    </div>
  );
};

export default RecordsViewGenerate;
