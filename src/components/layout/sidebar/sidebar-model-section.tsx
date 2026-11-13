import useT from '../../../hooks/ui/use-t';
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
  const t = useT();
  return (
    <section className="mb-4 last:mb-0">
      <div className="flex items-center justify-between pr-1 pb-1 pl-2">
        <h2 className="font-semibold">{title}</h2>
        <PanelHideButton panel={panel} />
      </div>
      {empty ? <p className="px-2 pb-2 text-muted">{t('common.none')}</p> : <ul>{children}</ul>}
    </section>
  );
};

export default SidebarModelSection;
