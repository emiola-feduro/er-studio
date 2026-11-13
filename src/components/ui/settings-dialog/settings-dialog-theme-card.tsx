import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import type { Theme } from '../../../lib/themes/themes';

type SettingsDialogThemeCardProps = {
  theme: Theme;
  active: boolean;
  onSelect: () => void;
};

/** Miniature of the theme drawn with its own colors, independent of the current theme. */
const SettingsDialogThemeCard = ({ theme, active, onSelect }: SettingsDialogThemeCardProps) => {
  const t = useT();
  const { id, colors, radius, borderWidth } = theme;
  const { canvas, node, nodeHeader, nodeBorder, edge, accent, fg, surface, pk, fk } = colors;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`overflow-hidden rounded-theme border-2 text-left transition-colors ${active ? 'border-accent' : 'border-line hover:border-muted'}`}
    >
      <div className="relative h-20" style={{ background: canvas }}>
        <div
          className="absolute top-3 left-3 w-16 overflow-hidden"
          style={{ background: node, border: `${borderWidth} solid ${nodeBorder}`, borderRadius: radius }}
        >
          <div className="h-3" style={{ background: nodeHeader }} />
          <div className="m-1 h-1 w-8" style={{ background: pk }} />
          <div className="m-1 h-1 w-10" style={{ background: fk }} />
        </div>
        <div className="absolute top-9 left-[5.25rem] h-0.5 w-8" style={{ background: edge }} />
        <div
          className="absolute top-6 right-3 h-8 w-10"
          style={{ background: node, border: `${borderWidth} solid ${nodeBorder}`, borderRadius: radius }}
        />
        <div className="absolute right-3 bottom-2 h-2 w-6" style={{ background: accent, borderRadius: radius }} />
      </div>
      <div className="px-2.5 py-1.5 font-medium" style={{ background: surface, color: fg }}>
        {t(`theme.${id}` as MessageKey)}
      </div>
    </button>
  );
};

export default SettingsDialogThemeCard;
