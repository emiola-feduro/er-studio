import { useState } from 'react';
import { checkSuggestions, regexExpression, regexSupport, unknownIdentifiers } from '../../../domain/constraint-suggestions';
import type { Attribute, DialectId } from '../../../domain/types';
import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import Button from '../../ui/button/button';
import ExpressionInput from '../../ui/expression-input/expression-input';

type InspectorCheckFieldProps = {
  id: string;
  dialect: DialectId;
  attribute: Attribute;
  /** Column names of the table, to complete and to check the expression against. */
  columns: string[];
  onChange: (value: string | undefined) => void;
};

/** CHECK constraint with suggestions for the column type and a regular expression helper. */
const InspectorCheckField = ({ id, dialect, attribute, columns, onChange }: InspectorCheckFieldProps) => {
  const t = useT();
  const { name, check } = attribute;
  const [pattern, setPattern] = useState('');
  const inputId = `attr-check-${id}`;
  const suggestions = checkSuggestions(dialect, attribute).map((s) => ({ value: s.value, label: t(`expr.meaning.${s.meaning}` as MessageKey) }));
  const unknown = check?.trim() ? unknownIdentifiers(check, columns) : [];
  const support = regexSupport(dialect);
  const regex = pattern.trim() ? regexExpression(dialect, name, pattern.trim()) : null;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block font-medium">
        {t('attr.check')}
      </label>
      <ExpressionInput
        id={inputId}
        value={check ?? ''}
        onChange={(value) => onChange(value || undefined)}
        suggestions={suggestions}
        columns={columns}
        placeholder={suggestions[0]?.value ?? t('attr.checkPlaceholder')}
        describedBy={unknown.length ? `${inputId}-unknown` : undefined}
        invalid={unknown.length > 0}
      />
      {unknown.length > 0 && (
        <span id={`${inputId}-unknown`} className="block text-[0.9em] text-warning">
          {t('expr.unknown', { names: unknown.join(', ') })}
        </span>
      )}
      <div className="space-y-1 pt-1">
        <label htmlFor={`${inputId}-regex`} className="block text-[0.9em] text-muted">
          {t('expr.regex')}
        </label>
        <div className="flex gap-1.5">
          <input
            id={`${inputId}-regex`}
            className="field field-sm min-w-0 flex-1 font-canvas"
            spellCheck={false}
            placeholder={t('expr.regexPlaceholder')}
            value={pattern}
            disabled={support === 'none'}
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && regex) onChange(regex);
            }}
          />
          <Button size="sm" disabled={!regex} onClick={() => regex && onChange(regex)}>
            {t('expr.apply')}
          </Button>
        </div>
        {support !== 'native' && (
          <span className="block text-[0.86em] text-muted">{support === 'none' ? t('expr.regexNone') : t('expr.regexExtension')}</span>
        )}
      </div>
    </div>
  );
};

export default InspectorCheckField;
