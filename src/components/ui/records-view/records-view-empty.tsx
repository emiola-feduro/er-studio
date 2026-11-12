import { addRow } from '../../../lib/actions';
import Button from '../button/button';

type RecordsViewEmptyProps = {
  tableId: string;
  tableName: string;
};

const RecordsViewEmpty = ({ tableId, tableName }: RecordsViewEmptyProps) => {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-[1.15em] font-semibold">{tableName} no tiene registros</h2>
        <Button variant="primary" className="mt-4" onClick={() => addRow(tableId)}>
          Añadir registro
        </Button>
      </div>
    </div>
  );
};

export default RecordsViewEmpty;
