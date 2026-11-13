import useT from '../../../hooks/ui/use-t';
import useProjectStore from '../../../stores/use-project-store';
import Pill from '../../ui/pill/pill';

const saveLabels = {
  saved: { text: 'topBar.saved', tone: 'neutral' },
  saving: { text: 'topBar.saving', tone: 'neutral' },
  error: { text: 'topBar.saveError', tone: 'danger' },
} as const;

const TopBarProjectName = () => {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const renameProject = useProjectStore((s) => s.renameProject);
  if (!project) return null;
  const { id, name } = project;
  const { text, tone } = saveLabels[saveStatus];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="project-name" className="sr-only">
        {t('topBar.projectName')}
      </label>
      <input
        id="project-name"
        value={name}
        onChange={(event) => renameProject(id, event.target.value)}
        className="field field-sm w-56 max-w-[40vw] border-transparent bg-transparent font-medium hover:border-line"
      />
      <Pill tone={tone}>{t(text)}</Pill>
    </div>
  );
};

export default TopBarProjectName;
