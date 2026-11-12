type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
};

const SegmentedControl = <T extends string>({ label, value, options, onChange, size = 'md' }: SegmentedControlProps<T>) => {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[calc(var(--radius)*0.75)] border-(length:--bw) border-line bg-surface-2 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[calc(var(--radius)*0.6)] font-medium transition-colors ${size === 'sm' ? 'px-2 py-0.5 text-[0.9em]' : 'px-3 py-1'} ${active ? 'bg-surface font-semibold text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
