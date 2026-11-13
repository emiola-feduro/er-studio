import usePreferencesStore from '../../../stores/use-preferences-store';
import ConstraintIcons, { CONSTRAINTS } from './constraint-icons';

type KeyMarkersProps = {
  pk: boolean;
  fk: boolean;
  size?: number;
};

/**
 * Key column of a table row: the primary key follows the "constraint icons" preference (PK text or icon),
 * a foreign key is always drawn as a key.
 */
const KeyMarkers = ({ pk, fk, size = 13 }: KeyMarkersProps) => {
  const showIcons = usePreferencesStore((s) => s.showConstraintIcons);

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {pk && (showIcons ? <ConstraintIcons kinds={['pk']} size={size} /> : <span className={`text-[10px] font-bold ${CONSTRAINTS.pk.className}`}>PK</span>)}
      {fk && <ConstraintIcons kinds={['fk']} size={size} />}
    </span>
  );
};

export default KeyMarkers;
