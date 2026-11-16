import { useCallback } from 'react';
import { sqlCompletions } from '../../domain/sql-completion';
import type { DialectId, Schema } from '../../domain/types';
import type { MessageKey } from '../../i18n';
import type { CompletionSource } from '../ui/use-sql-completion';
import useT from '../ui/use-t';

/** Autocomplete for the query editor: the model's tables and columns, in the project's gestor. */
const useEditorCompletion = (schema: Schema | undefined, dialect: DialectId | undefined): CompletionSource | undefined => {
  const t = useT();
  const sample = t('query.sample');
  const source = useCallback<CompletionSource>(
    (text, caret) => {
      if (!schema || !dialect) return { from: caret, to: caret, items: [] };
      const result = sqlCompletions(text, caret, schema, dialect, sample);
      return {
        ...result,
        items: result.items.map((item) => ({
          label: item.label,
          insert: item.insert,
          detail:
            item.kind === 'operator' && item.meaning
              ? t(`query.meaning.${item.meaning}` as MessageKey, { value: item.detail ?? '' })
              : item.kind === 'column'
                ? item.detail
                : item.kind === 'keyword'
                  ? undefined
                  : t(`completion.${item.kind}` as MessageKey),
        })),
      };
    },
    [schema, dialect, sample, t],
  );
  return schema && dialect ? source : undefined;
};

export default useEditorCompletion;
