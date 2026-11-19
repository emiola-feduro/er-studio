import type { ReactNode } from 'react';

type ConnectionFieldProps = {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

/** A label over its control, with the field problem under it. */
const ConnectionField = ({ id, label, error, className = '', children }: ConnectionFieldProps) => {
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[0.9em] text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export default ConnectionField;
