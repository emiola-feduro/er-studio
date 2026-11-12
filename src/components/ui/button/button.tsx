import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
};

const variantClasses = {
  primary: 'bg-accent text-accent-fg border-accent hover:opacity-90',
  secondary: 'bg-surface text-fg border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-fg border-transparent hover:bg-surface-2',
  danger: 'bg-surface text-danger border-line hover:bg-danger-soft',
};

const sizeClasses = {
  sm: 'min-h-8 px-2.5 text-[0.93em] gap-1.5',
  md: 'min-h-9 px-3.5 gap-2',
};

const Button = ({ variant = 'secondary', size = 'md', className = '', children, type = 'button', ...rest }: ButtonProps) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-[calc(var(--radius)*0.75)] border-(length:--bw) font-medium whitespace-nowrap transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
