import { useEffect, useState } from 'react';
import { parseSshConfig, type SshConfigHost } from '../../domain/connections';
import { uid } from '../../domain/model';
import { vmChain, vmLabel, vmSecret, type SshHost } from '../../domain/ssh-hosts';
import { t } from '../../i18n';
import { readSshConfig, type ConnectionReport } from '../../lib/connections';
import { deleteVmSecret, saveVmSecret, testVm } from '../../lib/terminal';
import useConnectionStore from '../../stores/use-connection-store';
import useTerminalStore from '../../stores/use-terminal-store';
import useUiStore from '../../stores/use-ui-store';

const blank = (): SshHost => {
  const now = Date.now();
  return { id: uid(), name: '', host: '', port: 22, user: '', auth: 'password', shell: 'default', createdAt: now, updatedAt: now };
};

const validPort = (port: number) => Number.isInteger(port) && port > 0 && port < 65536;

/** Field problems that block testing and saving, by field key. */
export const vmProblems = (draft: SshHost): Record<string, string> => {
  const problems: Record<string, string> = {};
  const required = t('connections.required');
  if (!draft.host.trim()) problems.host = required;
  if (!validPort(draft.port)) problems.port = t('connections.invalidPort');
  if (!draft.user.trim()) problems.user = required;
  if (draft.auth === 'key' && !draft.privateKeyPath?.trim()) problems.key = required;
  if (draft.shell === 'custom' && !draft.customShell?.trim()) problems.customShell = required;
  return problems;
};

/** State and actions of the VM dialog: editing, testing the sign-in, trusting its key, saving and deleting. */
const useVmDialog = () => {
  const { open, id } = useConnectionStore((s) => s.hostDialog);
  const hosts = useConnectionStore((s) => s.sshHosts);
  const connections = useConnectionStore((s) => s.connections);
  const saved = id ? hosts.find((h) => h.id === id) : undefined;
  const [draft, setDraft] = useState<SshHost>(blank);
  const [secret, setSecret] = useState('');
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sshHosts, setSshHosts] = useState<SshConfigHost[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(saved ? structuredClone(saved) : blank());
    setSecret('');
    setReport(null);
    setShowProblems(false);
    setSshHosts(null);
    // Only when the dialog opens or switches VM.
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = vmProblems(draft);
  const update = (patch: Partial<SshHost>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setReport(null);
  };

  /** The VMs this one may jump through: any other that does not already pass through it. */
  const viaChoices = hosts.filter((h) => h.id !== draft.id && !vmChain(hosts, h.id).some((c) => c.id === draft.id));
  /** Connections whose route goes through this VM. */
  const usedBy = connections.filter((c) => c.hops.some((hop) => hop.kind === 'vm' && hop.hostId === draft.id));

  const test = async (vm = draft) => {
    setShowProblems(true);
    if (Object.keys(vmProblems(vm)).length > 0) return;
    setTesting(true);
    setReport(null);
    try {
      setReport(await testVm(vm, secret));
    } finally {
      setTesting(false);
    }
  };

  /** Accepts the fingerprint the last test reported, on this VM or on the one it jumps through, and tests again. */
  const trustHostKey = async () => {
    const error = report?.error;
    if (!error || (error.code !== 'unknownHostKey' && error.code !== 'hostKeyChanged')) return;
    const fingerprint = error.code === 'unknownHostKey' ? error.fingerprint : error.actual;
    if (vmLabel(draft) === error.host) {
      const next = { ...draft, hostKey: fingerprint };
      setDraft(next);
      await test(next);
      return;
    }
    const jump = draft.viaId ? vmChain(hosts, draft.viaId).find((h) => vmLabel(h) === error.host) : undefined;
    if (jump) {
      useConnectionStore.getState().saveHost({ ...jump, hostKey: fingerprint, updatedAt: Date.now() });
      await test();
    }
  };

  const loadSshConfig = async () => {
    const text = await readSshConfig().catch(() => null);
    setSshHosts(text ? parseSshConfig(text) : []);
  };

  /** Fills the fields from a Host of ~/.ssh/config. */
  const importSshHost = (alias: string) => {
    const found = sshHosts?.find((h) => h.alias === alias);
    if (!found) return;
    update({
      name: draft.name || found.alias,
      host: found.hostName,
      port: found.port,
      user: found.user ?? draft.user,
      auth: found.identityFile ? 'key' : 'agent',
      privateKeyPath: found.identityFile,
    });
  };

  const close = () => useConnectionStore.getState().closeHostDialog();

  const save = async () => {
    setShowProblems(true);
    if (Object.keys(problems).length > 0) return;
    const name = draft.name.trim() || `${draft.user.trim()}@${draft.host.trim()}`;
    const vm: SshHost = { ...draft, name, host: draft.host.trim(), user: draft.user.trim(), updatedAt: Date.now() };
    try {
      // A VM without a secret (agent) drops the one it had.
      if (!vmSecret(vm)) await saveVmSecret(vm.id, null);
      else if (secret) await saveVmSecret(vm.id, secret);
    } catch (error) {
      useUiStore.getState().notify(t('connections.keychainFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      return;
    }
    useConnectionStore.getState().saveHost(vm);
    useUiStore.getState().notify(t('vms.saved', { name }));
    close();
  };

  const remove = async () => {
    if (!saved) return;
    await deleteVmSecret(saved.id).catch(() => undefined);
    const terminals = useTerminalStore.getState();
    for (const tab of terminals.tabs.filter((tab) => tab.hostId === saved.id)) terminals.close(tab.key);
    useConnectionStore.getState().removeHost(saved.id);
    setConfirmDelete(false);
    useUiStore.getState().notify(t('vms.deleted', { name: saved.name }));
    close();
  };

  return {
    open,
    editing: Boolean(saved),
    draft,
    update,
    secret,
    setSecret,
    viaChoices,
    usedBy,
    report,
    testing,
    test: () => void test(),
    trustHostKey: () => void trustHostKey(),
    sshHosts,
    loadSshConfig: () => void loadSshConfig(),
    importSshHost,
    problems: showProblems ? problems : {},
    save: () => void save(),
    close,
    confirmDelete,
    setConfirmDelete,
    remove: () => void remove(),
  };
};

export default useVmDialog;
