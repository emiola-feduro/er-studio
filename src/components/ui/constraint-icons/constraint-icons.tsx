import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { ArrowUp10, Asterisk, Fingerprint, KeyRound, Link2, Zap, type LucideIcon } from 'lucide-react';

export type ConstraintKind = 'pk' | 'fk' | 'nn' | 'uq' | 'ai' | 'ix';

export const CONSTRAINTS: Record<ConstraintKind, { icon: LucideIcon; text: string; label: MessageKey; className: string }> = {
  pk: { icon: KeyRound, text: 'PK', label: 'constraint.pk', className: 'text-pk' },
  fk: { icon: Link2, text: 'FK', label: 'constraint.fk', className: 'text-fk' },
  nn: { icon: Asterisk, text: 'NN', label: 'constraint.nn', className: 'text-muted' },
  uq: { icon: Fingerprint, text: 'UQ', label: 'constraint.uq', className: 'text-muted' },
  ai: { icon: ArrowUp10, text: 'AI', label: 'constraint.ai', className: 'text-muted' },
  ix: { icon: Zap, text: 'IX', label: 'constraint.ix', className: 'text-muted' },
};

type ConstraintIconsProps = {
  kinds: ConstraintKind[];
  size?: number;
};

/** Constraint markers drawn as icons. Each one keeps its name as tooltip and accessible label. */
const ConstraintIcons = ({ kinds, size = 12 }: ConstraintIconsProps) => {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {kinds.map((kind) => {
        const { icon: Icon, label, className } = CONSTRAINTS[kind];
        return (
          <span key={kind} title={t(label)} role="img" aria-label={t(label)} className={className}>
            <Icon size={size} strokeWidth={2.4} />
          </span>
        );
      })}
    </span>
  );
};

export default ConstraintIcons;
