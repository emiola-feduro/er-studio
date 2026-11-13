import { defaultSuggestions, defaultValueProblem, type DefaultMeaning, type DefaultProblem } from '../../../domain/default-values';
import type { Attribute, DialectId } from '../../../domain/types';
import SuggestionInput from '../../ui/suggestion-input/suggestion-input';

const MEANINGS: Record<DefaultMeaning, string> = {
  now: 'fecha y hora actuales',
  today: 'fecha actual',
  currentTime: 'hora actual',
  currentYear: 'año actual',
  true: 'verdadero',
  false: 'falso',
  zero: 'cero',
  one: 'uno',
  emptyText: 'texto vacío',
  newUuid: 'UUID nuevo',
  emptyJson: 'objeto vacío',
  enumValue: 'valor permitido',
};

const PROBLEMS: Record<DefaultProblem, (value: string) => string> = {
  unquotedText: (v) => `El texto va entre comillas simples: '${v}'`,
  notANumber: () => 'No es un número',
  notABoolean: () => 'No es un valor booleano válido para este gestor',
  unquotedDate: (v) => `Las fechas van entre comillas simples: '${v}'`,
};

type InspectorDefaultFieldProps = {
  id: string;
  dialect: DialectId;
  attribute: Attribute;
  onChange: (value: string | undefined) => void;
};

/** Default value with ready-made values that fit the column type and gestor. */
const InspectorDefaultField = ({ id, dialect, attribute, onChange }: InspectorDefaultFieldProps) => {
  const { defaultValue } = attribute;
  const suggestions = defaultSuggestions(dialect, attribute);
  const inputId = `attr-default-${id}`;
  const problem = defaultValueProblem(dialect, attribute);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block font-medium">
        Valor por defecto
      </label>
      <SuggestionInput
        id={inputId}
        className="field field-sm font-canvas"
        value={defaultValue ?? ''}
        suggestion={suggestions[0]?.value}
        placeholder={attribute.autoIncrement ? 'lo genera la base de datos' : undefined}
        onChange={(value) => onChange(value || undefined)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${inputId}-problem` : undefined}
      />
      {problem && (
        <span id={`${inputId}-problem`} className="block text-[0.9em] text-warning">
          {PROBLEMS[problem](defaultValue!.trim())}
        </span>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Valores sugeridos">
          {suggestions.slice(0, 6).map(({ value, meaning }) => (
            <button
              key={value}
              type="button"
              aria-pressed={defaultValue === value}
              onClick={() => onChange(defaultValue === value ? undefined : value)}
              className={`inline-flex items-baseline gap-1.5 rounded-[calc(var(--radius)*0.5)] border-(length:--bw) px-2 py-0.5 text-[0.86em] ${defaultValue === value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
            >
              <span className="font-canvas">{value}</span>
              {meaning !== 'enumValue' && <span className="text-muted">{MEANINGS[meaning]}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default InspectorDefaultField;
