import { useState } from 'react';
import { SSH_SHELLS, type SshShell } from '../../../domain/ssh-hosts';
import useT from '../../../hooks/ui/use-t';
import useConnectionStore from '../../../stores/use-connection-store';
import useTerminalStore from '../../../stores/use-terminal-store';
import Button from '../../ui/button/button';
import ConnectionField from '../../ui/connection-dialog/connection-field';

/** Opens a terminal on a saved VM with the shell of one's choice; the VM's own shell comes first. */
const TerminalNew = () => {
  const t = useT();
  const hosts = useConnectionStore((s) => s.sshHosts);
  const openHostDialog = useConnectionStore((s) => s.openHostDialog);
  const open = useTerminalStore((s) => s.open);
  const setChoosing = useTerminalStore((s) => s.setChoosing);
  const [hostId, setHostId] = useState(hosts[0]?.id ?? '');
  const host = hosts.find((h) => h.id === hostId);
  const [shell, setShell] = useState<SshShell | 'vm'>('vm');
  const [custom, setCustom] = useState('');

  if (hosts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3 py-3">
        <span className="text-muted">{t('vms.empty')}</span>
        <Button size="sm" variant="primary" onClick={() => openHostDialog()}>
          {t('vms.add')}
        </Button>
        <Button size="sm" onClick={() => setChoosing(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  const start = () => {
    if (!host) return;
    const chosen = shell === 'vm' ? host.shell : shell;
    open({ hostId: host.id, title: host.name, shell: chosen, customShell: shell === 'vm' ? host.customShell : custom });
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <ConnectionField id="terminal-vm" label={t('terminal.vm')} className="min-w-48">
        <select id="terminal-vm" className="field" value={hostId} onChange={(e) => setHostId(e.target.value)}>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </ConnectionField>
      <ConnectionField id="terminal-shell" label={t('vms.shell')} className="min-w-48">
        <select id="terminal-shell" className="field" value={shell} onChange={(e) => setShell(e.target.value as SshShell | 'vm')}>
          <option value="vm">{t('terminal.vmShell', { shell: t(`vms.shell.${host?.shell ?? 'default'}`) })}</option>
          {SSH_SHELLS.map((s) => (
            <option key={s} value={s}>
              {t(`vms.shell.${s}`)}
            </option>
          ))}
        </select>
      </ConnectionField>
      {shell === 'custom' && (
        <ConnectionField id="terminal-command" label={t('vms.command')} className="min-w-48 flex-1">
          <input id="terminal-command" className="field font-sql" value={custom} spellCheck={false} onChange={(e) => setCustom(e.target.value)} />
        </ConnectionField>
      )}
      <Button type="submit" variant="primary" disabled={shell === 'custom' && !custom.trim()}>
        {t('terminal.open')}
      </Button>
      <Button onClick={() => setChoosing(false)}>{t('common.cancel')}</Button>
    </form>
  );
};

export default TerminalNew;
