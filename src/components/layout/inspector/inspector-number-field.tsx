type InspectorNumberFieldProps = {
  id: string;
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
};

const InspectorNumberField = ({ id, label, value, onChange }: InspectorNumberFieldProps) => {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        className="field field-sm tabular-nums"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
      />
    </div>
  );
};

export default InspectorNumberField;
