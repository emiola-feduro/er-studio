import { ArrowUp10, Asterisk, Fingerprint, KeyRound, Link2, Zap, type LucideIcon } from 'lucide-react';

export type ConstraintKind = 'pk' | 'fk' | 'nn' | 'uq' | 'ai' | 'ix';

export const CONSTRAINTS: Record<ConstraintKind, { icon: LucideIcon; text: string; label: string; className: string }> = {
  pk: { icon: KeyRound, text: 'PK', label: 'Llave primaria', className: 'text-pk' },
  fk: { icon: Link2, text: 'FK', label: 'Llave foránea', className: 'text-fk' },
  nn: { icon: Asterisk, text: 'NN', label: 'No nulo (NOT NULL)', className: 'text-muted' },
  uq: { icon: Fingerprint, text: 'UQ', label: 'Único (UNIQUE)', className: 'text-muted' },
  ai: { icon: ArrowUp10, text: 'AI', label: 'Autoincremental', className: 'text-muted' },
  ix: { icon: Zap, text: 'IX', label: 'Indexada', className: 'text-muted' },
};

type ConstraintIconsProps = {
  kinds: ConstraintKind[];
  size?: number;
};

/** Constraint markers drawn as icons. Each one keeps its name as tooltip and accessible label. */
const ConstraintIcons = ({ kinds, size = 12 }: ConstraintIconsProps) => {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {kinds.map((kind) => {
        const { icon: Icon, label, className } = CONSTRAINTS[kind];
        return (
          <span key={kind} title={label} role="img" aria-label={label} className={className}>
            <Icon size={size} strokeWidth={2.4} />
          </span>
        );
      })}
    </span>
  );
};

export default ConstraintIcons;
