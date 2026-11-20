import type { SshAuthMethod } from './connections';

/**
 * Saved VMs (desktop only): an SSH host kept once and reused as a step of any connection's route and to
 * open terminals. Its password or key passphrase lives in the system keychain under its own id.
 */

/** The program a terminal starts: the login shell of the VM user, a known shell, or a command of one's own. */
export type SshShell = 'default' | 'bash' | 'zsh' | 'sh' | 'fish' | 'pwsh' | 'powershell' | 'cmd' | 'custom';

export const SSH_SHELLS: SshShell[] = ['default', 'bash', 'zsh', 'sh', 'fish', 'pwsh', 'powershell', 'cmd', 'custom'];

/** What runs for each shell; login shells read the user's profile as an SSH login would. */
export const SHELL_COMMANDS: Record<Exclude<SshShell, 'default' | 'custom'>, string> = {
  bash: 'bash -l',
  zsh: 'zsh -l',
  sh: 'sh -l',
  fish: 'fish -l',
  pwsh: 'pwsh -NoLogo',
  powershell: 'powershell.exe -NoLogo',
  cmd: 'cmd.exe',
};

export type SshHost = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: SshAuthMethod;
  privateKeyPath?: string;
  /** SHA256 fingerprint accepted the first time. */
  hostKey?: string;
  /** Another saved VM to jump through first (a bastion). */
  viaId?: string;
  shell: SshShell;
  /** The command when `shell` is "custom". */
  customShell?: string;
  createdAt: number;
  updatedAt: number;
};

/** Keychain slot of a saved VM's secret (its id is the entry name). */
export const VM_SECRET_SLOT = 'ssh';

/** The secret a VM's authentication asks for, if any. */
export const vmSecret = (host: Pick<SshHost, 'auth'>): 'password' | 'passphrase' | null =>
  host.auth === 'password' ? 'password' : host.auth === 'key' ? 'passphrase' : null;

/** The command a terminal runs on the VM; undefined starts the login shell. */
export const shellCommand = (shell: SshShell, custom?: string): string | undefined => {
  if (shell === 'default') return undefined;
  if (shell === 'custom') return custom?.trim() || undefined;
  return SHELL_COMMANDS[shell];
};

/** The VMs from the first jump to `id` itself. A loop in the "via" chain stops at the first repeat. */
export const vmChain = (hosts: SshHost[], id: string): SshHost[] => {
  const chain: SshHost[] = [];
  const seen = new Set<string>();
  let current = hosts.find((h) => h.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.viaId ? hosts.find((h) => h.id === current!.viaId) : undefined;
  }
  return chain;
};

/** The VMs a VM may jump through: every other one that does not already pass through it. */
export const viaOptions = (hosts: SshHost[], id: string) => hosts.filter((h) => h.id !== id && !vmChain(hosts, h.id).some((c) => c.id === id));

/**
 * One SSH hop as the desktop side receives it. Without a typed secret, the desktop side reads it from
 * the VM's keychain entry (`secretId`).
 */
export const vmHopConfig = (host: SshHost, secret?: string) => {
  const typed = secret && secret.length > 0 ? secret : undefined;
  const auth =
    host.auth === 'password'
      ? { method: 'password', password: typed ?? '' }
      : host.auth === 'key'
        ? { method: 'key', privateKeyPath: host.privateKeyPath?.trim(), passphrase: typed }
        : { method: 'agent' };
  return { kind: 'ssh' as const, host: host.host.trim(), port: host.port, user: host.user.trim(), auth, hostKey: host.hostKey || undefined, secretId: host.id };
};

/** The route to a VM: its jumps, then itself. `secret` is a typed secret for the VM itself (while editing it). */
export const vmRoute = (hosts: SshHost[], host: SshHost, secret?: string) => {
  const others = host.viaId ? vmChain(hosts, host.viaId).filter((h) => h.id !== host.id) : [];
  return [...others.map((h) => vmHopConfig(h)), vmHopConfig(host, secret)];
};

/** "[host]:port" or "host", as the desktop side names an SSH host in its errors. */
export const vmLabel = (host: Pick<SshHost, 'host' | 'port'>) => (host.port === 22 ? host.host.trim() : `[${host.host.trim()}]:${host.port}`);
