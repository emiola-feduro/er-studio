import useAppUpdate from '../../../hooks/ui/use-app-update';
import useT from '../../../hooks/ui/use-t';
import Button from '../../ui/button/button';

/** A new version of the desktop app: downloading in the background, then ready to install on restart. */
const UpdateBanner = () => {
  const t = useT();
  const { state, visible, restart, later } = useAppUpdate();
  if (!visible || state.phase === 'idle') return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft px-4 py-1.5">
      <span className="min-w-0 flex-1">
        {state.phase === 'downloading' &&
          (state.percent === null
            ? t('update.downloading', { version: state.version })
            : t('update.downloadingPercent', { version: state.version, percent: state.percent }))}
        {state.phase === 'ready' && t('update.ready', { version: state.version })}
        {state.phase === 'installing' && t('update.installing', { version: state.version })}
      </span>
      {state.phase === 'ready' && (
        <>
          <Button size="sm" variant="ghost" onClick={later}>
            {t('update.later')}
          </Button>
          <Button size="sm" variant="primary" onClick={restart}>
            {t('update.restart')}
          </Button>
        </>
      )}
    </div>
  );
};

export default UpdateBanner;
