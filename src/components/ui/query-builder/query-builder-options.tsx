import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import useT from '../../../hooks/ui/use-t';
import Checkbox from '../checkbox/checkbox';
import ExpressionInput from '../expression-input/expression-input';

type Builder = ReturnType<typeof useQueryBuilder>;

/** WHERE, ORDER BY, LIMIT and DISTINCT. */
const QueryBuilderOptions = ({ builder }: { builder: Builder }) => {
  const t = useT();
  const { spec, update, qualifiedColumns, result, tables } = builder;
  const order = spec.orderBy?.[0];
  const orderValue = order ? `${order.tableId}|${order.columnId}` : '';
  const orderable = Object.entries(result.plan.aliases).flatMap(([tableId, alias]) =>
    (tables.find((x) => x.id === tableId)?.columns ?? []).map((c) => ({ value: `${tableId}|${c.id}`, label: `${alias}.${c.name}` })),
  );

  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="query-where" className="block font-semibold">
          {t('query.where')}
        </label>
        <ExpressionInput
          id="query-where"
          value={spec.where ?? ''}
          onChange={(where) => update({ where })}
          suggestions={[]}
          columns={qualifiedColumns}
          placeholder={qualifiedColumns[1] ? `${qualifiedColumns[1]} IS NOT NULL` : ''}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="query-order" className="block font-semibold">
            {t('query.orderBy')}
          </label>
          <select
            id="query-order"
            className="field field-sm font-canvas"
            value={orderValue}
            onChange={(e) => {
              const [tableId, columnId] = e.target.value.split('|');
              update({ orderBy: e.target.value ? [{ tableId, columnId, direction: order?.direction ?? 'ASC' }] : [] });
            }}
          >
            <option value="">{t('query.noOrder')}</option>
            {orderable.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <select
          aria-label={t('query.orderBy')}
          className="field field-sm w-auto"
          disabled={!order}
          value={order?.direction ?? 'ASC'}
          onChange={(e) => order && update({ orderBy: [{ ...order, direction: e.target.value as 'ASC' | 'DESC' }] })}
        >
          <option value="ASC">{t('query.asc')}</option>
          <option value="DESC">{t('query.desc')}</option>
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label htmlFor="query-limit" className="block font-semibold">
            {t('query.limit')}
          </label>
          <input
            id="query-limit"
            type="number"
            min={0}
            className="field field-sm w-28 tabular-nums"
            value={spec.limit ?? ''}
            onChange={(e) => update({ limit: e.target.value === '' ? undefined : e.target.valueAsNumber })}
          />
        </div>
        <Checkbox label={t('query.distinct')} checked={Boolean(spec.distinct)} onChange={(distinct) => update({ distinct })} />
      </div>
    </section>
  );
};

export default QueryBuilderOptions;
