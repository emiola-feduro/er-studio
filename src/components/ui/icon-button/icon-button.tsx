import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
};

/** Icon-only button. The label is required and is used for the accessible name and tooltip. */
const IconButton = ({ label, tone = 'default', size = 'md', className = '', children, type = 'button', ...rest }: IconButtonProps) => {
  const toneClass = tone === 'danger' ? 'text-muted hover:text-danger hover:bg-danger-soft' : 'text-muted hover:text-fg hover:bg-surface-2';
  const sizeClass = size === 'sm' ? 'size-7' : 'size-9';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-[calc(var(--radius)*0.75)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sizeClass} ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default IconButton;
