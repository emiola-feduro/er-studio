import useModelVersions from '../../../hooks/data/use-model-versions';
import useT from '../../../hooks/ui/use-t';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import VersionsViewCompare from './versions-view-compare';
import VersionsViewList from './versions-view-list';

/** Saved versions of the model and the migration script between two of them. */
const VersionsView = () => {
  const t = useT();
  const versions = useModelVersions();

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-bg md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <div className="relative min-h-0 overflow-y-auto border-r border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t('versions.title')}</h2>
          <PanelsRestoreButton />
        </div>
        <VersionsViewList data={versions} />
      </div>
      <VersionsViewCompare data={versions} />
    </div>
  );
};

export default VersionsView;
