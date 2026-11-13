import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { defaultSuggestions, defaultValueProblem, type DefaultMeaning, type DefaultProblem } from '../../../domain/default-values';
import type { Attribute, DialectId } from '../../../domain/types';
import SuggestionInput from '../../ui/suggestion-input/suggestion-input';

const MEANING_KEYS: Record<Exclude<DefaultMeaning, 'enumValue'>, MessageKey> = {
  now: 'default.meaning.now',
  today: 'default.meaning.today',
  currentTime: 'default.meaning.currentTime',
  currentYear: 'default.meaning.currentYear',
  true: 'default.meaning.true',
  false: 'default.meaning.false',
  zero: 'default.meaning.zero',
  one: 'default.meaning.one',
  emptyText: 'default.meaning.emptyText',
  newUuid: 'default.meaning.newUuid',
  emptyJson: 'default.meaning.emptyJson',
};

const PROBLEM_KEYS: Record<DefaultProblem, MessageKey> = {
  unquotedText: 'default.problem.unquotedText',
  notANumber: 'default.problem.notANumber',
  notABoolean: 'default.problem.notABoolean',
  unquotedDate: 'default.problem.unquotedDate',
};

type InspectorDefaultFieldProps = {
  id: string;
  dialect: DialectId;
  attribute: Attribute;
  onChange: (value: string | undefined) => void;
};

/** Default value with ready-made values that fit the column type and gestor. */
const InspectorDefaultField = ({ id, dialect, attribute, onChange }: InspectorDefaultFieldProps) => {
  const t = useT();
  const { defaultValue } = attribute;
  const suggestions = defaultSuggestions(dialect, attribute);
  const inputId = `attr-default-${id}`;
  const problem = defaultValueProblem(dialect, attribute);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block font-medium">
        {t('default.label')}
      </label>
      <SuggestionInput
        id={inputId}
        className="field field-sm font-canvas"
        value={defaultValue ?? ''}
        suggestion={suggestions[0]?.value}
        placeholder={attribute.autoIncrement ? t('default.generated') : undefined}
        onChange={(value) => onChange(value || undefined)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${inputId}-problem` : undefined}
      />
      {problem && (
        <span id={`${inputId}-problem`} className="block text-[0.9em] text-warning">
          {t(PROBLEM_KEYS[problem], { value: defaultValue!.trim() })}
        </span>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('default.suggestions')}>
          {suggestions.slice(0, 6).map(({ value, meaning }) => (
            <button
              key={value}
              type="button"
              aria-pressed={defaultValue === value}
              onClick={() => onChange(defaultValue === value ? undefined : value)}
              className={`inline-flex items-baseline gap-1.5 rounded-[calc(var(--radius)*0.5)] border-(length:--bw) px-2 py-0.5 text-[0.86em] ${defaultValue === value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
            >
              <span className="font-canvas">{value}</span>
              {meaning !== 'enumValue' && <span className="text-muted">{t(MEANING_KEYS[meaning])}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default InspectorDefaultField;
