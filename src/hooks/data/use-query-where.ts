import { useMemo } from 'react';
import { unknownIdentifiers } from '../../domain/constraint-suggestions';
import { whereCompletions, type WhereColumn } from '../../domain/query-where';
import type { DialectId } from '../../domain/types';
import type { MessageKey } from '../../i18n';
import useT from '../ui/use-t';

/** Suggestions for the query WHERE that follow what is typed, and names that are not in the query. */
const useQueryWhere = (dialect: DialectId | undefined, columns: WhereColumn[], where: string, aliases: string[]) => {
  const t = useT();
  const sample = t('query.sample');

  const suggestions = useMemo(
    () =>
      dialect
        ? whereCompletions(dialect, columns, where, sample).map((c) => ({
            value: c.value,
            display: c.display,
            label: t(`query.meaning.${c.meaning}` as MessageKey, { value: c.detail ?? '' }),
          }))
        : [],
    [dialect, columns, where, sample, t],
  );

  const unknown = useMemo(
    () => unknownIdentifiers(where, [...aliases, ...columns.map((c) => c.column.name)]),
    [where, aliases, columns],
  );

  return { suggestions, unknown, refs: columns.map((c) => c.ref) };
};

export default useQueryWhere;
