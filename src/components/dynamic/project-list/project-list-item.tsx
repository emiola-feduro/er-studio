import useT from '../../../hooks/ui/use-t';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { DIALECTS } from '../../../domain/dialects';
import type { ProjectMeta } from '../../../domain/types';
import { getProject } from '../../../lib/db';
import { downloadText, serializeProject, slug } from '../../../lib/project-file';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import ConfirmDialog from '../../ui/confirm-dialog/confirm-dialog';
import IconButton from '../../ui/icon-button/icon-button';
import Menu from '../../ui/menu/menu';
import ProjectListRename from './project-list-rename';

type ProjectListItemProps = {
  meta: ProjectMeta;
  active: boolean;
};

const ProjectListItem = ({ meta, active }: ProjectListItemProps) => {
  const t = useT();
  const { id, name, dialect, tableCount } = meta;
  const openProject = useProjectStore((s) => s.openProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const open = () => {
    void openProject(id);
    useUiStore.getState().select(null);
    useUiStore.getState().setSidebarOpen(false);
  };

  const exportJson = async () => {
    const current = useProjectStore.getState().project;
    const project = current?.id === id ? current : await getProject(id);
    if (project) downloadText(`${slug(project.name)}.er.json`, serializeProject(project), 'application/json');
  };

  if (renaming) return <ProjectListRename id={id} name={name} onDone={() => setRenaming(false)} />;

  return (
    <li className={`group flex items-center rounded-[calc(var(--radius)*0.75)] ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
      <button type="button" onClick={open} aria-current={active ? 'true' : undefined} className="min-w-0 flex-1 px-2 py-1.5 text-left">
        <span className="block truncate font-medium">{name || t('common.untitled')}</span>
        <span className="block truncate text-[0.86em] text-muted">
          {t('projects.summary', { dialect: DIALECTS[dialect].name, count: tableCount })}
        </span>
      </button>
      <Menu
        trigger={({ open: menuOpen, toggle }) => (
          <IconButton label={t('projects.actions', { name })} size="sm" aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggle} className="mr-1">
            <MoreHorizontal size={16} />
          </IconButton>
        )}
        items={[
          { label: t('projects.rename'), onSelect: () => setRenaming(true) },
          { label: t('common.duplicate'), onSelect: () => void duplicateProject(id) },
          { label: t('projects.exportJson'), onSelect: () => void exportJson() },
          { label: t('common.delete'), danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        title={t('projects.deleteTitle')}
        message={t('projects.deleteMessage', { name })}
        confirmLabel={t('projects.deleteTitle')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void deleteProject(id);
        }}
      />
    </li>
  );
};

export default ProjectListItem;
