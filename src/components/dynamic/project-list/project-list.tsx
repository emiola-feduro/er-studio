import useT from '../../../hooks/ui/use-t';
import { useState, type MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import usePreferencesStore from '../../../stores/use-preferences-store';
import { DIALECTS } from '../../../domain/dialects';
import { matchesQuery } from '../../../lib/search';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import SearchInput from '../../ui/search-input/search-input';
import ProjectListError from './project-list-error';
import ProjectListItem from './project-list-item';
import ProjectListSkeleton from './project-list-skeleton';

type ProjectListProps = {
  /** Lets the list take the whole sidebar when the model lists are hidden. */
  expanded?: boolean;
  onContextMenu?: (event: MouseEvent) => void;
};

/** The saved projects; the list folds to its title like a dropdown, and the fold is remembered. */
const ProjectList = ({ expanded = false, onContextMenu }: ProjectListProps) => {
  const t = useT();
  const status = useProjectStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);
  const currentId = useProjectStore((s) => s.project?.id);
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  const [query, setQuery] = useState('');
  const visible = projects.filter((p) => matchesQuery(query, p.name, DIALECTS[p.dialect].name));
  const collapsed = usePreferencesStore((s) => Boolean(s.collapsedSections.projects));
  const setCollapsed = usePreferencesStore((s) => s.setSectionCollapsed);
  const current = projects.find((p) => p.id === currentId);

  return (
    <section className={`flex min-h-0 flex-col px-2 pt-3 pb-2 ${expanded && !collapsed ? 'flex-1' : 'max-h-[45%]'}`} onContextMenu={onContextMenu}>
      <div className="flex items-center justify-between gap-2 pr-2 pb-1.5 pl-1">
        <h2 className="min-w-0">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="project-list-body"
            title={t('sidebar.toggleSection', { name: t('projects.title') })}
            onClick={() => setCollapsed('projects', !collapsed)}
            className="flex min-w-0 items-center gap-1 rounded-[calc(var(--radius)*0.5)] px-1 py-0.5 font-semibold hover:bg-surface-2"
          >
            <ChevronRight size={15} aria-hidden className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            <span>{t('projects.title')}</span>
            <span className="text-[0.85em] font-normal text-muted tabular-nums">{projects.length}</span>
          </button>
          {/* Folded, the list still says which project is open. */}
          {collapsed && current && <span className="block truncate pl-6 text-[0.9em] font-normal text-muted">{current.name}</span>}
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setNewProjectOpen(true)}>
            {t('projects.new')}
          </Button>
          <PanelHideButton panel="projects" />
        </div>
      </div>
      {!collapsed && (
        <div id="project-list-body" className="flex min-h-0 flex-col">
          {status === 'ready' && projects.length > 0 && (
            <div className="px-1 pb-2">
              <SearchInput id="project-search" label={t('projects.search')} value={query} onChange={setQuery} />
            </div>
          )}
          {status === 'loading' && <ProjectListSkeleton />}
          {status === 'error' && <ProjectListError />}
          {status === 'ready' && (
            <ul className="relative min-h-0 overflow-y-auto">
              {projects.length === 0 && <li className="px-2 text-muted">{t('projects.empty')}</li>}
              {projects.length > 0 && visible.length === 0 && <li className="px-2 py-1 text-muted">{t('projects.noMatch', { query })}</li>}
              {visible.map((meta) => (
                <ProjectListItem key={meta.id} meta={meta} active={meta.id === currentId} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default ProjectList;
