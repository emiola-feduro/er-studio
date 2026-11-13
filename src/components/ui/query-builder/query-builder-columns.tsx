import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';

type Builder = ReturnType<typeof useQueryBuilder>;

/** Column checkboxes for each chosen table (junctions added only to connect tables are left out). */
const QueryBuilderColumns = ({ builder }: { builder: Builder }) => {
  const t = useT();
  const { spec, tables, setColumns, toggleColumn } = builder;

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{t('query.columns')}</h3>
      {spec.tableIds.map((tableId) => {
        const table = tables.find((x) => x.id === tableId);
        if (!table) return null;
        const selected = spec.columns?.[tableId];
        return (
          <fieldset key={tableId} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <legend className="font-medium">{table.name}</legend>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setColumns(tableId, undefined)}>
                  {t('query.all')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setColumns(tableId, [])}>
                  {t('query.none')}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
              {table.columns.map((column) => (
                <Checkbox key={column.id} label={column.name} checked={!selected || selected.includes(column.id)} onChange={(on) => toggleColumn(tableId, column.id, on)} />
              ))}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
};

export default QueryBuilderColumns;
