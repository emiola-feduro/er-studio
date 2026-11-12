import type { ReactNode } from 'react';

type PillProps = {
  tone?: 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'pk' | 'fk';
  children: ReactNode;
  title?: string;
};

const toneClasses = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-fg',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-surface-2 text-success',
  pk: 'bg-surface-2 text-pk',
  fk: 'bg-surface-2 text-fk',
};

/** Tinted status label. Text always carries the meaning, color only reinforces it. */
const Pill = ({ tone = 'neutral', children, title }: PillProps) => {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-px text-[0.8em] font-semibold whitespace-nowrap ${toneClasses[tone]}`}>
      {children}
    </span>
  );
};

export default Pill;
