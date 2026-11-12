import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { ddlType } from '../../../domain/dialects';
import type { Attribute } from '../../../domain/types';
import { updateAttribute } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';

type InspectorEnumValuesProps = {
  entityId: string;
  attribute: Attribute;
};

/** Editor for the allowed values of an ENUM column, shown as removable chips. */
const InspectorEnumValues = ({ entityId, attribute }: InspectorEnumValuesProps) => {
  const dialect = useProjectStore((s) => s.project?.dialect ?? 'postgresql');
  const { id, name, enumValues = [] } = attribute;
  const [draft, setDraft] = useState('');
  const setValues = (values: string[]) => updateAttribute(entityId, id, { enumValues: values });

  const add = () => {
    // Several values can be pasted at once, separated by commas or line breaks.
    const incoming = draft
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !enumValues.includes(v));
    if (incoming.length) setValues([...enumValues, ...new Set(incoming)]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && !draft && enumValues.length) {
      setValues(enumValues.slice(0, -1));
    }
  };

  return (
    <div className="ml-14 space-y-1.5 pt-1.5 pb-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line bg-surface p-1.5">
        {enumValues.map((value) => (
          <span key={value} className="inline-flex items-center gap-1 rounded-[calc(var(--radius)*0.5)] bg-accent-soft py-0.5 pr-0.5 pl-2 font-canvas text-[0.92em]">
            {value}
            <button
              type="button"
              aria-label={`Quitar ${value}`}
              onClick={() => setValues(enumValues.filter((v) => v !== value))}
              className="rounded p-0.5 text-muted hover:bg-surface hover:text-danger"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <label htmlFor={`enum-add-${id}`} className="sr-only">
          Añadir valor permitido a {name}
        </label>
        <input
          id={`enum-add-${id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={enumValues.length ? 'Añadir valor' : 'APPROVED, PENDING, REJECTED'}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 font-canvas outline-none"
        />
      </div>
      {enumValues.length > 0 && (
        <p className="text-[0.9em] text-muted">
          Se crea como <span className="font-canvas font-semibold text-fg">{ddlType(dialect, attribute)}</span> con CHECK.
        </p>
      )}
    </div>
  );
};

export default InspectorEnumValues;
