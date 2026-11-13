import useT from '../../../hooks/ui/use-t';
import { Search, X } from 'lucide-react';

type SearchInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

const SearchInput = ({ id, label, value, onChange, placeholder, autoFocus = false }: SearchInputProps) => {
  const t = useT();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
        className="field field-sm pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label={t('common.clearSearch')}
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
