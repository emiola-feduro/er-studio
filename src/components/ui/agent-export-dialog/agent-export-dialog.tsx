import useAgentExport, { TARGET_SUGGESTIONS, type AgentFormat, type AgentScope } from '../../../hooks/data/use-agent-export';
import useT from '../../../hooks/ui/use-t';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import Checkbox from '../checkbox/checkbox';
import Modal from '../modal/modal';
import SegmentedControl from '../segmented-control/segmented-control';

/** Exports the model as Markdown or JSON for a coding agent, optionally aimed at a technology. */
const AgentExportDialog = () => {
  const t = useT();
  const close = useUiStore((s) => s.closeAgentExport);
  const { open, tables, fields, canCopy, download, copy } = useAgentExport();
  const { format, setFormat, scope, setScope, tableId, setTableId, target, setTarget, notes, setNotes, includeDdl, setIncludeDdl } = fields;

  return (
    <Modal
      title={t('agentExport.dialogTitle')}
      open={open}
      onClose={close}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={() => void copy()} disabled={!canCopy} title={canCopy ? undefined : t('agentExport.copyZipHint')}>
            {t('agentExport.copy')}
          </Button>
          <Button variant="primary" onClick={() => void download()}>
            {t('agentExport.download')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="block font-medium">{t('agentExport.format')}</span>
          <SegmentedControl<AgentFormat>
            label={t('agentExport.format')}
            value={format}
            onChange={setFormat}
            options={[
              { value: 'markdown', label: 'Markdown' },
              { value: 'json', label: 'JSON' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block font-medium">{t('agentExport.scope')}</span>
          <SegmentedControl<AgentScope>
            label={t('agentExport.scope')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: t('agentExport.scopeAll') },
              { value: 'entity', label: t('agentExport.scopeEntity') },
              { value: 'perEntity', label: t('agentExport.scopePerEntity') },
            ]}
          />
        </div>
        {scope === 'entity' && (
          <div className="space-y-1.5">
            <label htmlFor="agent-entity" className="block font-medium">
              {t('agentExport.entity')}
            </label>
            <select id="agent-entity" className="field" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="agent-target" className="block font-medium">
            {t('agentExport.target')}
          </label>
          <input
            id="agent-target"
            className="field"
            list="agent-target-suggestions"
            placeholder={t('agentExport.targetPlaceholder')}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <datalist id="agent-target-suggestions">
            {TARGET_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="agent-notes" className="block font-medium">
            {t('agentExport.notesLabel')}
          </label>
          <textarea
            id="agent-notes"
            className="field min-h-20 resize-y"
            placeholder={t('agentExport.notesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Checkbox label={t('agentExport.includeDdl')} checked={includeDdl} onChange={setIncludeDdl} />
      </div>
    </Modal>
  );
};

export default AgentExportDialog;
