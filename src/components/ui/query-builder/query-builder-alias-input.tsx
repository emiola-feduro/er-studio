import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import useT from '../../../hooks/ui/use-t';
import type { MessageKey } from '../../../i18n';

type Builder = ReturnType<typeof useQueryBuilder>;

type QueryBuilderAliasInputProps = {
  builder: Builder;
  tableId: string;
  tableName: string;
};

/** Alias of a table in the query; empty means the automatic one, shown as placeholder. */
const QueryBuilderAliasInput = ({ builder, tableId, tableName }: QueryBuilderAliasInputProps) => {
  const t = useT();
  const { spec, result, setAlias } = builder;
  const effective = result.plan.aliases[tableId] ?? '';
  const problem = result.plan.aliasProblems[tableId];
  const id = `query-alias-${tableId}`;

  return (
    <span className="flex flex-col items-end gap-0.5">
      <input
        id={id}
        aria-label={t('query.alias', { table: tableName })}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        className="field field-sm w-16 px-1.5 text-right font-canvas text-[0.85em]"
        value={spec.aliases?.[tableId] ?? ''}
        placeholder={effective}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setAlias(tableId, e.target.value)}
      />
      {problem && (
        <span id={`${id}-problem`} className="max-w-40 text-right text-[0.8em] text-warning">
          {t(`query.aliasProblem.${problem}` as MessageKey, { alias: effective })}
        </span>
      )}
    </span>
  );
};

export default QueryBuilderAliasInput;
