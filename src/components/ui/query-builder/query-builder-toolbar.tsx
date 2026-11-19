import type useQueryBuilder from '../../../hooks/data/use-query-builder';
import type useQueryRunner from '../../../hooks/data/use-query-runner';
import { isDesktop } from '../../../lib/platform';
import useConnectionStore from '../../../stores/use-connection-store';
import useQueryStore from '../../../stores/use-query-store';
import useT from '../../../hooks/ui/use-t';
import { downloadText, slug } from '../../../lib/project-file';
import type { QueryTab } from '../../../stores/use-query-store';
import useUiStore from '../../../stores/use-ui-store';
import PanelsRestoreButton from '../../layout/panels-menu/panels-restore-button';
import Button from '../button/button';
import SegmentedControl from '../segmented-control/segmented-control';

type QueryBuilderToolbarProps = {
  builder: ReturnType<typeof useQueryBuilder>;
  runner: ReturnType<typeof useQueryRunner>;
  sql: string;
  onCopyToEditor: () => void;
};

/** Generated or Editor tab, the actions on that tab's SQL, and Run. */
const QueryBuilderToolbar = ({ builder, runner, sql, onCopyToEditor }: QueryBuilderToolbarProps) => {
  const t = useT();
  const { tab, setTab, spec, clear, result, setCustomSql, projectName } = builder;
  const generated = tab === 'generated';
  const connections = useConnectionStore((s) => s.connections);
  const projectId = builder.project?.id;
  const setTarget = useQueryStore((s) => s.setTarget);

  const copy = async () => {
    const { notify } = useUiStore.getState();
    try {
      await navigator.clipboard.writeText(sql);
      notify(t('query.copied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      <SegmentedControl<QueryTab>
        label={t('query.tabs')}
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'generated', label: t('query.tabGenerated') },
          { value: 'editor', label: t('query.tabEditor') },
        ]}
      />
      <Button
        size="sm"
        variant="primary"
        title={t('query.runTitle')}
        disabled={!runner.ready || runner.status === 'loading'}
        onClick={() => void runner.execute()}
      >
        {t('query.run')}
      </Button>
      {isDesktop() && projectId && (
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('live.target')}</span>
          <select className="field w-auto py-0.5" value={runner.connection?.id ?? ''} onChange={(e) => setTarget(projectId, e.target.value || null)}>
            <option value="">{t('live.records')}</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="mr-auto" />
      {generated ? (
        <>
          <Button size="sm" variant="ghost" disabled={!result.sql} onClick={onCopyToEditor}>
            {t('query.toEditor')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!spec.tableIds.length}
            onClick={() => {
              clear();
              if (runner.from === 'generated') runner.reset();
            }}
          >
            {t('query.clear')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={!sql} onClick={() => setCustomSql('')}>
          {t('query.clearEditor')}
        </Button>
      )}
      <Button size="sm" onClick={() => void copy()} disabled={!sql}>
        {t('common.copy')}
      </Button>
      <Button size="sm" disabled={!sql} onClick={() => downloadText(`${slug(projectName)}-query.sql`, sql, 'application/sql')}>
        {t('query.download')}
      </Button>
      <PanelsRestoreButton />
    </div>
  );
};

export default QueryBuilderToolbar;
