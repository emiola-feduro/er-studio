import { useCallback, useMemo } from 'react';
import { unknownIdentifiers } from '../../domain/constraint-suggestions';
import { whereCompletions, type WhereColumn } from '../../domain/query-where';
import type { DialectId } from '../../domain/types';
import type { MessageKey } from '../../i18n';
import useT from '../ui/use-t';

/** Suggestions for the query WHERE that follow what is typed, and names that are not in the query. */
const useQueryWhere = (dialect: DialectId | undefined, columns: WhereColumn[], where: string, aliases: string[]) => {
  const t = useT();
  const sample = t('query.sample');

  // Worked out from the text before the cursor, so conditions can be added anywhere.
  const suggestions = useCallback(
    (before: string, after: string) =>
      dialect
        ? whereCompletions(dialect, columns, before, sample, after).map((c) => ({
            value: c.value,
            display: c.display,
            label: t(`query.meaning.${c.meaning}` as MessageKey, { value: c.detail ?? '' }),
          }))
        : [],
    [dialect, columns, sample, t],
  );
  const placeholder = useMemo(() => suggestions('', '')[0]?.value ?? '', [suggestions]);

  const unknown = useMemo(
    () => unknownIdentifiers(where, [...aliases, ...columns.map((c) => c.column.name)]),
    [where, aliases, columns],
  );

  return { suggestions, placeholder, unknown, refs: columns.map((c) => c.ref) };
};

export default useQueryWhere;
