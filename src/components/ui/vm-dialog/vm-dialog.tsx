import type { SshAuthMethod } from '../../../domain/connections';
import { SSH_SHELLS, vmSecret, type SshShell } from '../../../domain/ssh-hosts';
import useVmDialog from '../../../hooks/data/use-vm-dialog';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';
import ConnectionDialogReport from '../connection-dialog/connection-dialog-report';
import ConnectionField from '../connection-dialog/connection-field';
import Modal from '../modal/modal';

const AUTH_METHODS: SshAuthMethod[] = ['password', 'key', 'agent'];

/** New or edited VM: where it is, how to sign in, the bastion it goes through and the shell its terminals start. */
const VmDialog = () => {
  const t = useT();
  const dialog = useVmDialog();
  const { draft, update, problems, editing } = dialog;
  const secretKind = vmSecret(draft);

  return (
    <Modal
      title={t(editing ? 'vms.dialogEdit' : 'vms.dialogNew')}
      open={dialog.open}
      onClose={dialog.close}
      width="max-w-2xl"
      footer={
        <>
          {editing && (
            <Button variant="danger" className="mr-auto" onClick={() => dialog.setConfirmDelete(true)}>
              {t('connections.delete')}
            </Button>
          )}
          <Button onClick={dialog.close}>{t('common.cancel')}</Button>
          <Button disabled={dialog.testing} onClick={dialog.test}>
            {dialog.testing ? t('connections.testing') : t('connections.test')}
          </Button>
          <Button variant="primary" onClick={dialog.save}>
            {t('connections.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <ConnectionField id="vm-name" label={t('connections.name')} className="min-w-48 flex-1">
            <input
              id="vm-name"
              className="field"
              value={draft.name}
              placeholder={draft.user && draft.host ? `${draft.user}@${draft.host}` : ''}
              onChange={(e) => update({ name: e.target.value })}
            />
          </ConnectionField>
          <Button variant="ghost" onClick={dialog.loadSshConfig}>
            {t('connections.importSsh')}
          </Button>
        </div>
        {dialog.sshHosts &&
          (dialog.sshHosts.length === 0 ? (
            <p className="text-muted">{t('connections.noSshConfig')}</p>
          ) : (
            <ConnectionField id="vm-ssh-host" label={t('connections.sshHost')}>
              <select id="vm-ssh-host" className="field" defaultValue="" onChange={(e) => e.target.value && dialog.importSshHost(e.target.value)}>
                <option value="" disabled>
                  {t('connections.chooseSshHost')}
                </option>
                {dialog.sshHosts.map((host) => (
                  <option key={host.alias} value={host.alias}>
                    {host.alias === host.hostName ? host.alias : `${host.alias} (${host.hostName})`}
                  </option>
                ))}
              </select>
            </ConnectionField>
          ))}

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <ConnectionField id="vm-host" label={t('connections.host')} error={problems.host}>
            <input id="vm-host" className="field" value={draft.host} spellCheck={false} onChange={(e) => update({ host: e.target.value })} />
          </ConnectionField>
          <ConnectionField id="vm-port" label={t('connections.port')} error={problems.port}>
            <input
              id="vm-port"
              className="field"
              type="number"
              min={1}
              max={65535}
              value={draft.port}
              onChange={(e) => update({ port: Number(e.target.value) })}
            />
          </ConnectionField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ConnectionField id="vm-user" label={t('connections.user')} error={problems.user}>
            <input id="vm-user" className="field" value={draft.user} spellCheck={false} onChange={(e) => update({ user: e.target.value })} />
          </ConnectionField>
          <ConnectionField id="vm-auth" label={t('connections.auth')}>
            <select id="vm-auth" className="field" value={draft.auth} onChange={(e) => update({ auth: e.target.value as SshAuthMethod })}>
              {AUTH_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`connections.auth.${method}`)}
                </option>
              ))}
            </select>
          </ConnectionField>
          {draft.auth === 'key' && (
            <ConnectionField id="vm-key" label={t('connections.keyPath')} error={problems.key}>
              <input
                id="vm-key"
                className="field font-sql"
                value={draft.privateKeyPath ?? ''}
                placeholder="~/.ssh/id_ed25519"
                spellCheck={false}
                onChange={(e) => update({ privateKeyPath: e.target.value })}
              />
            </ConnectionField>
          )}
          {secretKind && (
            <ConnectionField id="vm-secret" label={t(secretKind === 'password' ? 'connections.password' : 'connections.passphrase')}>
              <input
                id="vm-secret"
                className="field"
                type="password"
                autoComplete="off"
                value={dialog.secret}
                placeholder={editing ? t('connections.keepSecret') : ''}
                onChange={(e) => dialog.setSecret(e.target.value)}
              />
            </ConnectionField>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ConnectionField id="vm-via" label={t('vms.via')}>
            <select id="vm-via" className="field" value={draft.viaId ?? ''} onChange={(e) => update({ viaId: e.target.value || undefined })}>
              <option value="">{t('vms.direct')}</option>
              {dialog.viaChoices.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.name}
                </option>
              ))}
            </select>
          </ConnectionField>
          <ConnectionField id="vm-shell" label={t('vms.shell')}>
            <select id="vm-shell" className="field" value={draft.shell} onChange={(e) => update({ shell: e.target.value as SshShell })}>
              {SSH_SHELLS.map((shell) => (
                <option key={shell} value={shell}>
                  {t(`vms.shell.${shell}`)}
                </option>
              ))}
            </select>
          </ConnectionField>
          {draft.shell === 'custom' && (
            <ConnectionField id="vm-command" label={t('vms.command')} error={problems.customShell} className="sm:col-span-2">
              <input
                id="vm-command"
                className="field font-sql"
                value={draft.customShell ?? ''}
                placeholder="tmux new -A -s main"
                spellCheck={false}
                onChange={(e) => update({ customShell: e.target.value })}
              />
            </ConnectionField>
          )}
        </div>
        {draft.hostKey && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0">
              <span className="block text-muted">{t('connections.hostKey')}</span>
              <code className="font-[inherit] font-sql break-all">{draft.hostKey}</code>
            </span>
            <Button size="sm" variant="ghost" onClick={() => update({ hostKey: undefined })}>
              {t('connections.forgetHostKey')}
            </Button>
          </div>
        )}
        {dialog.report && (
          <ConnectionDialogReport
            report={dialog.report}
            onTrust={dialog.trustHostKey}
            success={t('vms.signedIn', { user: draft.user.trim(), host: draft.host.trim() })}
          />
        )}
      </div>
      <ConfirmDialog
        open={dialog.confirmDelete}
        title={t('vms.deleteTitle')}
        message={
          dialog.usedBy.length > 0 ? t('vms.deleteUsed', { name: draft.name, count: dialog.usedBy.length }) : t('vms.deleteMessage', { name: draft.name })
        }
        confirmLabel={t('connections.delete')}
        onConfirm={dialog.remove}
        onCancel={() => dialog.setConfirmDelete(false)}
      />
    </Modal>
  );
};

export default VmDialog;
