import useT from '../../../hooks/ui/use-t';
import { useState, type FormEvent } from 'react';
import useProjectStore from '../../../stores/use-project-store';

type ProjectListRenameProps = {
  id: string;
  name: string;
  onDone: () => void;
};

const ProjectListRename = ({ id, name, onDone }: ProjectListRenameProps) => {
  const t = useT();
  const renameProject = useProjectStore((s) => s.renameProject);
  const [value, setValue] = useState(name);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (value.trim() && value.trim() !== name) void renameProject(id, value.trim());
    onDone();
  };

  return (
    <li className="px-1 py-1">
      <form onSubmit={submit}>
        <label htmlFor={`rename-${id}`} className="sr-only">
          {t('projects.newName')}
        </label>
        <input
          id={`rename-${id}`}
          className="field field-sm"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => submit()}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
        />
      </form>
    </li>
  );
};

export default ProjectListRename;
