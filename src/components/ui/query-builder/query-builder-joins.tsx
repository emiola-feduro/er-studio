import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import type { JoinType } from '../../../domain/query-builder';
import useT from '../../../hooks/ui/use-t';
import SegmentedControl from '../segmented-control/segmented-control';

type Builder = ReturnType<typeof useQueryBuilder>;

const QueryBuilderJoins = ({ builder }: { builder: Builder }) => {
  const t = useT();
  const { result, tables, setJoinType } = builder;
  const { joins } = result.plan;
  if (joins.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{t('query.joins')}</h3>
      <ul className="space-y-2">
        {joins.map((join) => (
          <li key={join.tableId} className="space-y-1.5 rounded-[calc(var(--radius)*0.75)] bg-surface-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {tables.find((x) => x.id === join.tableId)?.name} <span className="font-canvas text-muted">{join.alias}</span>
              </span>
              <SegmentedControl<JoinType>
                label={t('query.joins')}
                size="sm"
                value={join.type}
                onChange={(type) => setJoinType(join.tableId, type)}
                options={[
                  { value: 'INNER', label: 'INNER' },
                  { value: 'LEFT', label: 'LEFT' },
                ]}
              />
            </div>
            <p className="font-canvas text-[0.85em] break-all text-muted">ON {join.on.map(([a, b]) => `${a} = ${b}`).join(' AND ')}</p>
            {join.bridge && <p className="text-[0.85em] text-muted">{t('query.bridge')}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default QueryBuilderJoins;
