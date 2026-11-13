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
  downloadText(`${slug(project.name)}${withRecords ? '-completo' : ''}.sql`, sql, 'application/sql');
};

const TopBarExportMenu = () => {
  const exportImage = useExportImage();
  const importProject = useImportProject();
  const { exportRecords } = useExportRecords();

  return (
    <Menu
      trigger={({ open, toggle }) => (
        <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          Exportar
        </Button>
      )}
      items={[
        { label: 'Script SQL (.sql)', onSelect: withProject((p) => downloadSql(p, false)) },
        { label: 'Script SQL con registros (.sql)', onSelect: withProject((p) => downloadSql(p, true)) },
        { label: 'Imagen PNG', onSelect: () => void exportImage('png') },
        { label: 'Imagen SVG', onSelect: () => void exportImage('svg') },
        { label: 'Copiar imagen PNG', onSelect: () => void exportImage('copy-png') },
        { label: 'Registros como INSERT (.sql)', onSelect: () => void exportRecords('sql'), separatorBefore: true },
        { label: 'Registros a Excel (.xlsx)', onSelect: () => void exportRecords('xlsx') },
        { label: 'Registros a CSV (.zip)', onSelect: () => void exportRecords('csv-zip') },
        { label: 'Registros a JSON (.json)', onSelect: () => void exportRecords('json') },
        {
          label: 'Proyecto JSON',
          onSelect: withProject((p) => downloadText(`${slug(p.name)}.er.json`, serializeProject(p), 'application/json')),
          separatorBefore: true,
        },
        { label: 'Importar proyecto JSON', onSelect: importProject },
      ]}
    />
  );
};

export default TopBarExportMenu;
