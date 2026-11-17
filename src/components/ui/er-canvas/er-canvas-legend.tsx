import useT from '../../../hooks/ui/use-t';
import useHoverDismiss from '../../../hooks/ui/use-hover-dismiss';
import KeyMarkers from '../constraint-icons/key-markers';
import usePreferencesStore from '../../../stores/use-preferences-store';
import ConstraintIcons, { CONSTRAINTS, type ConstraintKind } from '../constraint-icons/constraint-icons';

const KINDS: ConstraintKind[] = ['pk', 'fk', 'nn', 'uq', 'ai', 'ix'];

const ErCanvasLegend = () => {
  const t = useT();
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);
  const disclosure = useHoverDismiss<HTMLDetailsElement>();

  return (
    <details
      {...disclosure}
      className="absolute bottom-3 left-14 z-10 rounded-theme border-(length:--bw) border-line bg-surface/95 text-[12px] shadow-theme backdrop-blur-sm">
      <summary className="cursor-pointer px-3 py-1.5 font-medium select-none">{t('legend.title')}</summary>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-3 pb-2.5">
        {KINDS.map((kind) => (
          <div key={kind} className="contents">
            <dt className={`font-bold ${CONSTRAINTS[kind].className}`}>
              {showIcons || kind === 'fk' ? <ConstraintIcons kinds={[kind]} size={14} /> : CONSTRAINTS[kind].text}
            </dt>
            <dd>{t(CONSTRAINTS[kind].label)}</dd>
          </div>
        ))}
        <dt>
          <KeyMarkers pk fk size={14} />
        </dt>
        <dd>{t('legend.pf')}</dd>
        <dt className="font-semibold">||</dt>
        <dd>{t('legend.exactlyOne')}</dd>
        <dt className="font-semibold">o|</dt>
        <dd>{t('legend.zeroOrOne')}</dd>
        <dt className="font-semibold">|&lt;</dt>
        <dd>{t('legend.oneOrMany')}</dd>
        <dt className="font-semibold">o&lt;</dt>
        <dd>{t('legend.zeroOrMany')}</dd>
        <dt className="font-semibold">{t('legend.dashed')}</dt>
        <dd>{t('legend.junction')}</dd>
        <dt>
          <span className="inline-flex size-4.5 items-center justify-center rounded-full border-2 border-current font-canvas text-[11px] font-bold">d</span>
        </dt>
        <dd>{t('legend.disjoint')}</dd>
        <dt>
          <span className="inline-flex size-4.5 items-center justify-center rounded-full border-2 border-current font-canvas text-[11px] font-bold">o</span>
        </dt>
        <dd>{t('legend.overlapping')}</dd>
        <dt>
          <svg aria-hidden width="22" height="10" viewBox="0 0 22 10">
            <line x1="0" y1="2" x2="22" y2="2" stroke="currentColor" strokeWidth="1.6" />
            <line x1="0" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </dt>
        <dd>{t('legend.total')}</dd>
        <dt>
          <svg aria-hidden width="14" height="14" viewBox="-7 -7 14 14">
            <path d="M 5 -5 L 0 -5 A 5 5 0 0 0 0 5 L 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </dt>
        <dd>{t('legend.subset')}</dd>
      </dl>
    </details>
  );
};

export default ErCanvasLegend;
