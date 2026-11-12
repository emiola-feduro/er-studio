import useProjectStore from '../../../stores/use-project-store';
import Pill from '../../ui/pill/pill';

const saveLabels = {
  saved: { text: 'Guardado', tone: 'neutral' },
  saving: { text: 'Guardando', tone: 'neutral' },
  error: { text: 'Error al guardar', tone: 'danger' },
} as const;

const TopBarProjectName = () => {
  const project = useProjectStore((s) => s.project);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const renameProject = useProjectStore((s) => s.renameProject);
  if (!project) return null;
  const { id, name } = project;
  const { text, tone } = saveLabels[saveStatus];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="project-name" className="sr-only">
        Nombre del proyecto
      </label>
      <input
        id="project-name"
        value={name}
        onChange={(event) => renameProject(id, event.target.value)}
        className="field field-sm w-56 max-w-[40vw] border-transparent bg-transparent font-medium hover:border-line"
      />
      <Pill tone={tone}>{text}</Pill>
    </div>
  );
};

export default TopBarProjectName;
