type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
};

const Checkbox = ({ label, checked, onChange, disabled = false, title }: CheckboxProps) => {
  return (
    <label title={title} className={`inline-flex items-center gap-2 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-(--c-accent)"
      />
      <span>{label}</span>
    </label>
  );
};

export default Checkbox;
