import useT from '../../../hooks/ui/use-t';
import { addRow } from '../../../lib/actions';
import Button from '../button/button';

type RecordsViewEmptyProps = {
  tableId: string;
  tableName: string;
};

const RecordsViewEmpty = ({ tableId, tableName }: RecordsViewEmptyProps) => {
  const t = useT();
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-[1.15em] font-semibold">{t('records.empty', { name: tableName })}</h2>
        <Button variant="primary" className="mt-4" onClick={() => addRow(tableId)}>
          {t('records.addRow')}
        </Button>
      </div>
    </div>
  );
};

export default RecordsViewEmpty;
