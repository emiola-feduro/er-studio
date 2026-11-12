import type { ReactNode } from 'react';
import type { PanelId } from '../../../stores/use-preferences-store';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';

type SidebarModelSectionProps = {
  title: string;
  panel: PanelId;
  empty: boolean;
  children: ReactNode;
};

const SidebarModelSection = ({ title, panel, empty, children }: SidebarModelSectionProps) => {
  return (
    <section className="mb-4 last:mb-0">
      <div className="flex items-center justify-between pr-1 pb-1 pl-2">
        <h2 className="font-semibold">{title}</h2>
        <PanelHideButton panel={panel} label={title.toLowerCase()} />
      </div>
      {empty ? <p className="px-2 pb-2 text-muted">Ninguna todavía</p> : <ul>{children}</ul>}
    </section>
  );
};

export default SidebarModelSection;
