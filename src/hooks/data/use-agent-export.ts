import { useEffect, useMemo, useState } from 'react';
import { buildModelSpec, toAgentJson, toAgentMarkdown, type AgentExportOptions } from '../../domain/model-spec';
import { t } from '../../i18n';
import { getDdl, getDerived } from '../../lib/derived';
import { sheetNames } from '../../lib/excel';
import { downloadBlob, downloadText, slug } from '../../lib/project-file';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';

export type AgentFormat = 'markdown' | 'json';
export type AgentScope = 'all' | 'entity' | 'perEntity';

/** Technologies offered as suggestions; any other text works too. */
export const TARGET_SUGGESTIONS = [
  'TypeScript interfaces',
  'TypeScript + Zod',
  'Prisma',
  'TypeORM',
  'Drizzle ORM',
  'Sequelize',
  'Django models',
  'SQLAlchemy 2.0',
  'Pydantic v2',
  'Java JPA / Hibernate',
  'Kotlin data classes',
  'Kotlin + Exposed',
  'C# Entity Framework Core',
  'Go structs + GORM',
  'Ruby on Rails ActiveRecord',
  'Laravel Eloquent',
  'Swift Codable',
  'Dart / Flutter',
];

const EXTENSION: Record<AgentFormat, string> = { markdown: 'md', json: 'json' };
const MIME: Record<AgentFormat, string> = { markdown: 'text/markdown', json: 'application/json' };

/** Form state and output of the "export for an AI agent" dialog. */
const useAgentExport = () => {
  const project = useProjectStore((s) => s.project);
  const { open, tableId: preselected } = useUiStore((s) => s.agentExport);
  const [format, setFormat] = useState<AgentFormat>('markdown');
  const [scope, setScope] = useState<AgentScope>('all');
  const [tableId, setTableId] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [includeDdl, setIncludeDdl] = useState(false);

  const tables = useMemo(() => (project ? getDerived(project).schema.tables : []), [project]);

  // Opening from an entity's menu starts on that entity.
  useEffect(() => {
    if (!open) return;
    if (preselected) {
      setScope('entity');
      setTableId(preselected);
    } else if (!tables.some((t) => t.id === tableId)) setTableId(tables[0]?.id ?? '');
  }, [open, preselected]); // eslint-disable-line react-hooks/exhaustive-deps

  const render = (ids?: string[], withDdl = includeDdl) => {
    if (!project) return '';
    const spec = buildModelSpec(project, getDerived(project).schema, ids);
    const options: AgentExportOptions = { target, notes, ddl: withDdl ? getDdl(project).sql : undefined };
    return format === 'json' ? toAgentJson(spec, options) : toAgentMarkdown(spec, options);
  };

  /** Text for the single-file scopes; the per-entity scope only downloads. */
  const text = () => (scope === 'entity' ? render([tableId]) : render());

  const download = async () => {
    if (!project) return;
    const { notify, closeAgentExport } = useUiStore.getState();
    const base = `${slug(project.name)}-model`;
    if (scope === 'perEntity') {
      const { zipSync, strToU8 } = await import('fflate');
      const names = sheetNames(tables.map((table) => table.name));
      const files: Record<string, Uint8Array> = {};
      tables.forEach((table, i) => {
        files[`${names[i]}.${EXTENSION[format]}`] = strToU8(render([table.id], false));
      });
      if (includeDdl) files['schema.sql'] = strToU8(getDdl(project).sql);
      downloadBlob(`${base}.zip`, new Blob([zipSync(files)], { type: 'application/zip' }));
    } else {
      const name = scope === 'entity' ? slug(tables.find((t) => t.id === tableId)?.name ?? 'entity') : base;
      downloadText(`${name}.${EXTENSION[format]}`, text(), MIME[format]);
    }
    notify(t('agentExport.downloaded'));
    closeAgentExport();
  };

  const copy = async () => {
    const { notify } = useUiStore.getState();
    try {
      await navigator.clipboard.writeText(text());
      notify(t('agentExport.copied'));
    } catch {
      notify(t('agentExport.copyFailed'), 'error');
    }
  };

  return {
    open,
    tables,
    fields: { format, setFormat, scope, setScope, tableId, setTableId, target, setTarget, notes, setNotes, includeDdl, setIncludeDdl },
    canCopy: scope !== 'perEntity',
    download,
    copy,
  };
};

export default useAgentExport;
