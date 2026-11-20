import { useEffect, useState } from 'react';
import {
  DEFAULT_PORTS,
  DEFAULT_USERS,
  hopSecret,
  newHop,
  parseConnectionUrl,
  parseSshConfig,
  sshHopsFor,
  sshHostLabel,
  usesConnectString,
  type ConnectionEngine,
  type ConnectionProfile,
  type ConnectionSecrets,
  type HopKind,
  type HopProfile,
  type SshConfigHost,
} from '../../domain/connections';
import { uid } from '../../domain/model';
import { t } from '../../i18n';
import {
  deleteSecrets,
  readSshConfig,
  readWalletAliases,
  saveSecrets,
  sessionErrorMessage,
  testConnection,
  type ConnectionReport,
} from '../../lib/connections';
import useConnectionStore from '../../stores/use-connection-store';
import useUiStore from '../../stores/use-ui-store';

const blank = (): ConnectionProfile => {
  const now = Date.now();
  return {
    id: uid(),
    name: '',
    environment: 'local',
    engine: 'postgres',
    host: 'localhost',
    port: DEFAULT_PORTS.postgres,
    database: 'postgres',
    user: 'postgres',
    tls: { mode: 'prefer' },
    hops: [],
    timeoutSecs: 15,
    createdAt: now,
    updatedAt: now,
  };
};

/** A name for a connection made from a connect string: the alias, or the service of a descriptor. */
export const oracleName = (connectString: string) => {
  const text = connectString.trim();
  const service = /SERVICE_NAME\s*=\s*([^)\s]+)/i.exec(text)?.[1] ?? /\bSID\s*=\s*([^)\s]+)/i.exec(text)?.[1];
  if (service) return service.split('.')[0];
  return text.startsWith('(') ? 'Oracle' : text.split(/[/:?]/).filter(Boolean).pop() || 'Oracle';
};

const validPort = (port: number) => Number.isInteger(port) && port > 0 && port < 65536;

/** Field problems that block testing and saving, by field key. */
export const connectionProblems = (draft: ConnectionProfile): Record<string, string> => {
  const problems: Record<string, string> = {};
  const required = t('connections.required');
  if (draft.engine === 'sqlite') {
    if (!draft.file?.trim()) problems.file = required;
    return problems;
  }
  if (usesConnectString(draft)) {
    if (!draft.connectString?.trim()) problems.connectString = required;
  } else if (!draft.host.trim()) problems.host = required;
  // A SQL Server named instance may leave the port at 0: SQL Browser gives it.
  const portZeroOk = draft.engine === 'sqlserver' && Boolean(draft.instance?.trim()) && draft.port === 0;
  if (!usesConnectString(draft)) {
    if (!validPort(draft.port) && !portZeroOk) problems.port = t('connections.invalidPort');
    if (!draft.database.trim() && draft.engine !== 'mysql') problems.database = required;
  }
  if (!draft.user.trim() && !draft.integratedAuth) problems.user = required;
  // The Oracle driver checks TLS against the host it reaches, which through a tunnel is this computer.
  if (draft.engine === 'oracle' && draft.hops.length > 0) {
    if (usesConnectString(draft)) problems.oracleRoute = t('connections.oracle.routeString');
    else if (draft.wallet?.trim() || draft.tls.mode !== 'disable') problems.oracleRoute = t('connections.oracle.routeTls');
  }
  draft.hops.forEach((hop, index) => {
    if (!hop.host.trim()) problems[`hop${index}.host`] = required;
    if (!validPort(hop.port)) problems[`hop${index}.port`] = t('connections.invalidPort');
    if (hop.kind === 'ssh' && !hop.user.trim()) problems[`hop${index}.user`] = required;
    if (hop.kind === 'ssh' && hop.auth === 'key' && !hop.privateKeyPath?.trim()) problems[`hop${index}.key`] = required;
  });
  return problems;
};

/** State and actions of the connection dialog: editing, testing with diagnostics, trusting SSH keys and saving. */
const useConnectionDialog = () => {
  const { open, id } = useConnectionStore((s) => s.dialog);
  const connections = useConnectionStore((s) => s.connections);
  const saved = id ? connections.find((c) => c.id === id) : undefined;
  const [draft, setDraft] = useState<ConnectionProfile>(blank);
  const [secrets, setSecrets] = useState<ConnectionSecrets>({ db: '', hops: [], wallet: '' });
  const [walletAliases, setWalletAliases] = useState<string[]>([]);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [sshHosts, setSshHosts] = useState<SshConfigHost[] | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(saved ? structuredClone(saved) : blank());
    setSecrets({ db: '', hops: saved?.hops.map(() => '') ?? [], wallet: '' });
    setReport(null);
    setSshHosts(null);
    setShowProblems(false);
    // Only when the dialog opens or switches connection.
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The aliases of the chosen wallet, to pick one instead of typing the connect string.
  const walletPath = draft.engine === 'oracle' ? (draft.wallet?.trim() ?? '') : '';
  useEffect(() => {
    setWalletError(null);
    if (!walletPath) {
      setWalletAliases([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      readWalletAliases(walletPath)
        .then((aliases) => current && setWalletAliases(aliases))
        .catch((error) => {
          if (!current) return;
          setWalletAliases([]);
          setWalletError(sessionErrorMessage(error));
        });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [walletPath]);

  const problems = connectionProblems(draft);
  const invalid = Object.keys(problems).length > 0;

  const update = (patch: Partial<ConnectionProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setReport(null);
  };

  const updateHop = (index: number, hop: HopProfile) => update({ hops: draft.hops.map((h, i) => (i === index ? hop : h)) });

  const addHop = (kind: HopKind) => {
    update({ hops: [...draft.hops, newHop(kind)] });
    setSecrets((s) => ({ ...s, hops: [...s.hops, ''] }));
  };

  const removeHop = (index: number) => {
    update({ hops: draft.hops.filter((_, i) => i !== index) });
    setSecrets((s) => ({ ...s, hops: s.hops.filter((_, i) => i !== index) }));
  };

  const moveHop = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= draft.hops.length) return;
    const swap = <T>(list: T[]) => {
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    };
    update({ hops: swap(draft.hops) });
    setSecrets((s) => ({ ...s, hops: swap(s.hops) }));
  };

  /** Switching the gestor sets its usual port, user and database, unless they were changed by hand. */
  const setEngine = (engine: ConnectionEngine) => {
    const previous = draft.engine;
    const usual = (value: string | number, of: Record<ConnectionEngine, string | number>) => value === of[previous] || value === '' || value === 0;
    const databases: Record<ConnectionEngine, string> = { postgres: 'postgres', mysql: '', sqlserver: 'master', oracle: '', sqlite: '' };
    // Oracle has no "TLS if offered": it is in the clear or verified.
    const tlsMode =
      engine === 'oracle' && (draft.tls.mode === 'prefer' || draft.tls.mode === 'require' || draft.tls.mode === 'verifyCa') ? 'disable' : draft.tls.mode;
    update({
      tls: { ...draft.tls, mode: tlsMode },
      oracleConnectBy: engine === 'oracle' ? (draft.oracleConnectBy ?? 'service') : draft.oracleConnectBy,
      engine,
      port: usual(draft.port, DEFAULT_PORTS) ? DEFAULT_PORTS[engine] : draft.port,
      user: usual(draft.user, DEFAULT_USERS) ? DEFAULT_USERS[engine] : draft.user,
      database: usual(draft.database, databases) ? databases[engine] : draft.database,
      hops: engine === 'sqlite' ? [] : draft.hops,
      integratedAuth: engine === 'sqlserver' ? draft.integratedAuth : false,
    });
  };

  /** Picks an Oracle wallet (the zip the cloud console gives); a wallet always means TLS. */
  const chooseWallet = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: false, filters: [{ name: 'Wallet', extensions: ['zip'] }] });
    if (typeof path === 'string') update({ wallet: path, tls: { ...draft.tls, mode: 'verifyFull' } });
  };

  const setWalletSecret = (value: string) => setSecrets((s) => ({ ...s, wallet: value }));

  /** Picks a SQLite file with the system dialog. */
  const chooseFile = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: false, filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }] });
    if (typeof path === 'string') update({ file: path });
  };

  const setDbSecret = (value: string) => setSecrets((s) => ({ ...s, db: value }));
  const setHopSecret = (index: number, value: string) => setSecrets((s) => ({ ...s, hops: s.hops.map((v, i) => (i === index ? value : v)) }));

  /** Fills the fields from a pasted URL. Returns false when the text is not one. */
  const applyUrl = (text: string) => {
    const parsed = parseConnectionUrl(text);
    if (!parsed) return false;
    const { password, tlsMode, ...fields } = parsed;
    const unverifiable = fields.engine === 'oracle' && ['prefer', 'require', 'verifyCa'].includes(draft.tls.mode);
    update({
      ...fields,
      oracleConnectBy: fields.oracleConnectBy ?? draft.oracleConnectBy,
      tls: { ...draft.tls, mode: tlsMode ?? (unverifiable ? 'disable' : draft.tls.mode) },
    });
    if (password) setDbSecret(password);
    return true;
  };

  const loadSshConfig = async () => {
    const text = await readSshConfig().catch(() => null);
    setSshHosts(text ? parseSshConfig(text) : []);
  };

  /** Replaces the SSH hops with the ones that reach a host of ~/.ssh/config; proxies before them stay. */
  const importSshHost = (alias: string) => {
    if (!sshHosts) return;
    const hops = sshHopsFor(sshHosts, alias);
    const proxies = draft.hops.filter((h) => h.kind !== 'ssh');
    update({ hops: [...proxies, ...hops] });
    setSecrets((s) => ({ ...s, hops: [...proxies.map(() => ''), ...hops.map(() => '')] }));
  };

  const test = async (profile = draft) => {
    setShowProblems(true);
    if (Object.keys(connectionProblems(profile)).length > 0) return;
    setTesting(true);
    setReport(null);
    try {
      setReport(await testConnection(profile, secrets, saved?.id));
    } finally {
      setTesting(false);
    }
  };

  /** Index of the SSH hop an unknown or changed host key belongs to. */
  const hopOfKey = (host: string) => draft.hops.findIndex((h) => h.kind === 'ssh' && !h.hostKey && sshHostLabel(h.host.trim(), h.port) === host);
  const hopOfChangedKey = (host: string) => draft.hops.findIndex((h) => h.kind === 'ssh' && sshHostLabel(h.host.trim(), h.port) === host);

  /** Accepts the fingerprint the last test reported and tests again. */
  const trustHostKey = async () => {
    const error = report?.error;
    if (!error || (error.code !== 'unknownHostKey' && error.code !== 'hostKeyChanged')) return;
    const fingerprint = error.code === 'unknownHostKey' ? error.fingerprint : error.actual;
    const index = error.code === 'unknownHostKey' ? hopOfKey(error.host) : hopOfChangedKey(error.host);
    if (index < 0) return;
    const hop = draft.hops[index];
    if (hop.kind !== 'ssh') return;
    const next = { ...draft, hops: draft.hops.map((h, i) => (i === index ? { ...hop, hostKey: fingerprint } : h)) };
    setDraft(next);
    await test(next);
  };

  const close = () => useConnectionStore.getState().closeDialog();

  const save = async () => {
    setShowProblems(true);
    if (invalid) return;
    const name =
      draft.name.trim() ||
      (draft.engine === 'sqlite'
        ? (draft.file ?? '').split(/[\\/]/).pop() || 'SQLite'
        : usesConnectString(draft)
          ? oracleName(draft.connectString ?? '')
          : t('connections.defaultName', { database: draft.database.trim() || draft.host.trim(), host: draft.host.trim() }));
    const profile: ConnectionProfile = { ...draft, name, updatedAt: Date.now() };
    const withoutSecret = profile.hops.flatMap((hop, index) => (hopSecret(hop) ? [] : [index]));
    try {
      await saveSecrets(profile.id, secrets, withoutSecret, profile.engine !== 'oracle' || !profile.wallet?.trim());
    } catch (error) {
      useUiStore.getState().notify(t('connections.keychainFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
      return;
    }
    useConnectionStore.getState().save(profile);
    useUiStore.getState().notify(t('connections.saved', { name }));
    close();
  };

  const remove = async () => {
    if (!saved) return;
    await deleteSecrets(saved.id).catch(() => undefined);
    useConnectionStore.getState().remove(saved.id);
    setConfirmDelete(false);
    useUiStore.getState().notify(t('connections.deleted', { name: saved.name }));
    close();
  };

  return {
    open,
    editing: Boolean(saved),
    draft,
    update,
    updateHop,
    setEngine,
    chooseFile,
    addHop,
    removeHop,
    moveHop,
    secrets,
    setDbSecret,
    setHopSecret,
    chooseWallet,
    setWalletSecret,
    walletAliases,
    walletError,
    applyUrl,
    sshHosts,
    loadSshConfig,
    importSshHost,
    report,
    testing,
    test: () => void test(),
    trustHostKey: () => void trustHostKey(),
    problems: showProblems ? problems : {},
    save: () => void save(),
    close,
    confirmDelete,
    setConfirmDelete,
    remove: () => void remove(),
  };
};

export default useConnectionDialog;
