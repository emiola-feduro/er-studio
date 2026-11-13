import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import useT from '../../../hooks/ui/use-t';
import Checkbox from '../checkbox/checkbox';

type Builder = ReturnType<typeof useQueryBuilder>;

const QueryBuilderTables = ({ builder }: { builder: Builder }) => {
  const t = useT();
  const { tables, spec, toggleTable, result } = builder;

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{t('query.tables')}</legend>
      <p className="text-[0.9em] text-muted">{t('query.tablesHint')}</p>
      <div className="space-y-1.5">
        {tables.map((table) => {
          const order = spec.tableIds.indexOf(table.id);
          return (
            <div key={table.id} className="flex items-center justify-between gap-2">
              <Checkbox label={table.name} checked={order >= 0} onChange={(on) => toggleTable(table.id, on)} />
              {order >= 0 && <span className="font-canvas text-[0.85em] text-muted">{result.plan.aliases[table.id]}</span>}
            </div>
          );
        })}
      </div>
      {result.plan.unreachable.length > 0 && (
        <p className="text-[0.9em] text-warning">{t('query.unreachable', { names: result.plan.unreachable.join(', ') })}</p>
      )}
    </fieldset>
  );
};

export default QueryBuilderTables;
