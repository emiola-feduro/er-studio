import { useState } from 'react';
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

/** `expanded` lets the list take the whole sidebar when the model lists are hidden. */
const ProjectList = ({ expanded = false }: { expanded?: boolean }) => {
  const status = useProjectStore((s) => s.status);
  const projects = useProjectStore((s) => s.projects);
  const currentId = useProjectStore((s) => s.project?.id);
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  const [query, setQuery] = useState('');
  const visible = projects.filter((p) => matchesQuery(query, p.name, DIALECTS[p.dialect].name));

  return (
    <section className={`flex min-h-0 flex-col px-2 pt-3 pb-2 ${expanded ? 'flex-1' : 'max-h-[45%]'}`}>
      <div className="flex items-center justify-between px-2 pb-1.5">
        <h2 className="font-semibold">Proyectos</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setNewProjectOpen(true)}>
            Nuevo
          </Button>
          <PanelHideButton panel="projects" label="proyectos" />
        </div>
      </div>
      {status === 'ready' && projects.length > 0 && (
        <div className="px-1 pb-2">
          <SearchInput id="project-search" label="Buscar proyectos" value={query} onChange={setQuery} />
        </div>
      )}
      {status === 'loading' && <ProjectListSkeleton />}
      {status === 'error' && <ProjectListError />}
      {status === 'ready' && (
        <ul className="min-h-0 overflow-y-auto">
          {projects.length === 0 && <li className="px-2 text-muted">No hay proyectos</li>}
          {projects.length > 0 && visible.length === 0 && <li className="px-2 py-1 text-muted">Ningún proyecto coincide con "{query}"</li>}
          {visible.map((meta) => (
            <ProjectListItem key={meta.id} meta={meta} active={meta.id === currentId} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default ProjectList;
