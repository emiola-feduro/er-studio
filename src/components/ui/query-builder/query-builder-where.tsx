import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import useQueryWhere from '../../../hooks/data/use-query-where';
import useT from '../../../hooks/ui/use-t';
import ExpressionInput from '../expression-input/expression-input';

type Builder = ReturnType<typeof useQueryBuilder>;

/** WHERE with suggestions that fit the type of each column. */
const QueryBuilderWhere = ({ builder }: { builder: Builder }) => {
  const t = useT();
  const { dialect, whereColumns, spec, update, result } = builder;
  const where = spec.where ?? '';
  const { suggestions, placeholder, unknown, refs } = useQueryWhere(dialect, whereColumns, where, Object.values(result.plan.aliases));

  return (
    <div className="space-y-1.5">
      <label htmlFor="query-where" className="block font-semibold">
        {t('query.where')}
      </label>
      <ExpressionInput
        id="query-where"
        value={where}
        onChange={(value) => update({ where: value })}
        suggestions={suggestions}
        columns={refs}
        placeholder={placeholder}
        multiline
        invalid={unknown.length > 0}
        describedBy={unknown.length ? 'query-where-unknown' : undefined}
      />
      {unknown.length > 0 && (
        <span id="query-where-unknown" className="block text-[0.9em] text-warning">
          {t('query.unknown', { names: unknown.join(', ') })}
        </span>
      )}
    </div>
  );
};

export default QueryBuilderWhere;
