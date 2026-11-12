import useHoverDismiss from '../../../hooks/ui/use-hover-dismiss';
import usePreferencesStore from '../../../stores/use-preferences-store';
import ConstraintIcons, { CONSTRAINTS, type ConstraintKind } from '../constraint-icons/constraint-icons';

const KINDS: ConstraintKind[] = ['pk', 'fk', 'nn', 'uq', 'ai', 'ix'];

const ErCanvasLegend = () => {
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);
  const disclosure = useHoverDismiss<HTMLDetailsElement>();

  return (
    <details
      {...disclosure}
      className="absolute bottom-3 left-14 z-10 rounded-theme border-(length:--bw) border-line bg-surface/95 text-[12px] shadow-theme backdrop-blur-sm">
      <summary className="cursor-pointer px-3 py-1.5 font-medium select-none">Leyenda</summary>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-3 pb-2.5">
        {KINDS.map((kind) => (
          <div key={kind} className="contents">
            <dt className={`font-bold ${CONSTRAINTS[kind].className}`}>
              {showIcons ? <ConstraintIcons kinds={[kind]} size={14} /> : CONSTRAINTS[kind].text}
            </dt>
            <dd>{CONSTRAINTS[kind].label}</dd>
          </div>
        ))}
        {!showIcons && (
          <>
            <dt className="font-bold text-pk">PF</dt>
            <dd>Llave foránea que forma parte de la PK</dd>
          </>
        )}
        <dt className="font-semibold">||</dt>
        <dd>Exactamente uno</dd>
        <dt className="font-semibold">o|</dt>
        <dd>Cero o uno</dd>
        <dt className="font-semibold">|&lt;</dt>
        <dd>Uno o muchos</dd>
        <dt className="font-semibold">o&lt;</dt>
        <dd>Cero o muchos</dd>
        <dt className="font-semibold">Borde punteado</dt>
        <dd>Tabla intermedia</dd>
      </dl>
    </details>
  );
};

export default ErCanvasLegend;
