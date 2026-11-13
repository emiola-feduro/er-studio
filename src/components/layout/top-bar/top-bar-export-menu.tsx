import { t as translate } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import useExportImage from '../../../hooks/canvas/use-export-image';
import useExportRecords from '../../../hooks/data/use-export-records';
import useImportProject from '../../../hooks/data/use-import-project';
import { generateInserts } from '../../../domain/records-export';
import type { Project } from '../../../domain/types';
import { getDdl, getDerived } from '../../../lib/derived';
import { downloadText, serializeProject, slug } from '../../../lib/project-file';
import useProjectStore from '../../../stores/use-project-store';
import Button from '../../ui/button/button';
import Menu from '../../ui/menu/menu';

const withProject = (fn: (project: Project) => void) => () => {
  const project = useProjectStore.getState().project;
  if (project) fn(project);
};

const downloadSql = (project: Project, withRecords: boolean) => {
  const ddl = getDdl(project).sql;
  const sql = withRecords ? `${ddl}\n${generateInserts(project, getDerived(project).schema, false).sql}` : ddl;
  downloadText(`${slug(project.name)}${withRecords ? `-${slug(translate('export.fileSuffixFull'))}` : ''}.sql`, sql, 'application/sql');
};

const TopBarExportMenu = () => {
  const t = useT();
  const exportImage = useExportImage();
  const importProject = useImportProject();
  const { exportRecords } = useExportRecords();

  return (
    <Menu
      trigger={({ open, toggle }) => (
        <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          {t('export.button')}
        </Button>
      )}
      items={[
        { label: t('export.sql'), onSelect: withProject((p) => downloadSql(p, false)) },
        { label: t('export.sqlWithRecords'), onSelect: withProject((p) => downloadSql(p, true)) },
        { label: t('export.png'), onSelect: () => void exportImage('png') },
        { label: t('export.svg'), onSelect: () => void exportImage('svg') },
        { label: t('export.copyPng'), onSelect: () => void exportImage('copy-png') },
        { label: t('export.recordsSql'), onSelect: () => void exportRecords('sql'), separatorBefore: true },
        { label: t('export.recordsXlsx'), onSelect: () => void exportRecords('xlsx') },
        { label: t('export.recordsCsv'), onSelect: () => void exportRecords('csv-zip') },
        { label: t('export.recordsJson'), onSelect: () => void exportRecords('json') },
        {
          label: t('export.projectJson'),
          onSelect: withProject((p) => downloadText(`${slug(p.name)}.er.json`, serializeProject(p), 'application/json')),
          separatorBefore: true,
        },
        { label: t('export.importJson'), onSelect: importProject },
      ]}
    />
  );
};

export default TopBarExportMenu;
