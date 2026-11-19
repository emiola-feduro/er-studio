/**
 * Saved database connections (desktop only). A profile holds everything but the secrets: passwords,
 * passphrases and proxy passwords go to the system keychain and come back only inside the desktop app.
 */

export type ConnectionEngine = 'postgres';

export type ConnectionEnvironment = 'local' | 'development' | 'staging' | 'production';

export const ENVIRONMENTS: ConnectionEnvironment[] = ['local', 'development', 'staging', 'production'];

export type TlsMode = 'disable' | 'prefer' | 'require' | 'verifyCa' | 'verifyFull';

export const TLS_MODES: TlsMode[] = ['disable', 'prefer', 'require', 'verifyCa', 'verifyFull'];

export type SshAuthMethod = 'password' | 'key' | 'agent';

export type HopProfile =
  | { kind: 'ssh'; host: string; port: number; user: string; auth: SshAuthMethod; privateKeyPath?: string; hostKey?: string }
  | { kind: 'socks5'; host: string; port: number; username?: string }
  | { kind: 'socks4'; host: string; port: number; userId?: string }
  | { kind: 'httpConnect'; host: string; port: number; username?: string };

export type HopKind = HopProfile['kind'];

export const HOP_KINDS: HopKind[] = ['ssh', 'socks5', 'socks4', 'httpConnect'];

export type TlsProfile = { mode: TlsMode; caPem?: string; serverName?: string; clientCertPem?: string; clientKeyPem?: string };

export type ConnectionProfile = {
  id: string;
  name: string;
  environment: ConnectionEnvironment;
  engine: ConnectionEngine;
  host: string;
  port: number;
  database: string;
  user: string;
  tls: TlsProfile;
  /** From this computer outward. */
  hops: HopProfile[];
  timeoutSecs: number;
  createdAt: number;
  updatedAt: number;
};

/** Secrets typed in the dialog: the database password and one per hop (password, passphrase or proxy password). */
export type ConnectionSecrets = { db: string; hops: string[] };

export const DEFAULT_PORTS: Record<HopKind | ConnectionEngine, number> = { postgres: 5432, ssh: 22, socks5: 1080, socks4: 1080, httpConnect: 3128 };

export const newHop = (kind: HopKind): HopProfile => {
  const port = DEFAULT_PORTS[kind];
  switch (kind) {
    case 'ssh':
      return { kind, host: '', port, user: '', auth: 'password' };
    case 'socks4':
      return { kind, host: '', port };
    default:
      return { kind, host: '', port };
  }
};

/** Whether a hop takes a secret, and which one the field asks for. */
export const hopSecret = (hop: HopProfile): 'password' | 'passphrase' | null => {
  if (hop.kind === 'ssh') return hop.auth === 'password' ? 'password' : hop.auth === 'key' ? 'passphrase' : null;
  if (hop.kind === 'socks5' || hop.kind === 'httpConnect') return hop.username ? 'password' : null;
  return null;
};

/** Keychain slot of each secret, the same names the desktop side uses. */
export const secretSlot = (index?: number) => (index === undefined ? 'db' : `hop${index}`);

const filled = (value: string | undefined) => (value && value.length > 0 ? value : undefined);

/** The settings the desktop side receives. Empty secrets are left out so it fills them from the keychain. */
export const toConnectionConfig = (profile: ConnectionProfile, secrets?: ConnectionSecrets) => ({
  engine: profile.engine,
  host: profile.host.trim(),
  port: profile.port,
  database: profile.database.trim(),
  user: profile.user.trim(),
  password: filled(secrets?.db),
  tls: {
    mode: profile.tls.mode,
    caPem: filled(profile.tls.caPem),
    serverName: filled(profile.tls.serverName?.trim()),
    clientCertPem: filled(profile.tls.clientCertPem),
    clientKeyPem: filled(profile.tls.clientKeyPem),
  },
  hops: profile.hops.map((hop, index) => {
    const secret = filled(secrets?.hops[index]);
    switch (hop.kind) {
      case 'ssh': {
        const auth =
          hop.auth === 'password'
            ? { method: 'password', password: secret ?? '' }
            : hop.auth === 'key'
              ? { method: 'key', privateKeyPath: hop.privateKeyPath?.trim(), passphrase: secret }
              : { method: 'agent' };
        return { kind: 'ssh', host: hop.host.trim(), port: hop.port, user: hop.user.trim(), auth, hostKey: filled(hop.hostKey) };
      }
      case 'socks5':
      case 'httpConnect':
        return { kind: hop.kind, host: hop.host.trim(), port: hop.port, username: filled(hop.username?.trim()), password: secret };
      case 'socks4':
        return { kind: 'socks4', host: hop.host.trim(), port: hop.port, userId: filled(hop.userId?.trim()) };
    }
  }),
  timeoutSecs: profile.timeoutSecs,
});

const SSL_MODES: Record<string, TlsMode> = {
  disable: 'disable',
  allow: 'prefer',
  prefer: 'prefer',
  require: 'require',
  'verify-ca': 'verifyCa',
  'verify-full': 'verifyFull',
};

export type ParsedUrl = Pick<ConnectionProfile, 'engine' | 'host' | 'port' | 'database' | 'user'> & { password?: string; tlsMode?: TlsMode };

/** Reads "postgres://user:password@host:5432/db?sslmode=verify-full" (also postgresql://). Null when it is not one. */
export const parseConnectionUrl = (text: string): ParsedUrl | null => {
  const trimmed = text.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    // URL only parses special schemes fully, so read it as http with the same parts.
    url = new URL(trimmed.replace(/^postgres(ql)?:/i, 'http:'));
  } catch {
    return null;
  }
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
  return {
    engine: 'postgres',
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : DEFAULT_PORTS.postgres,
    database: decode(url.pathname.replace(/^\//, '')) || 'postgres',
    user: decode(url.username),
    password: url.password ? decode(url.password) : undefined,
    tlsMode: sslmode ? SSL_MODES[sslmode] : undefined,
  };
};

export type SshConfigHost = { alias: string; hostName: string; user?: string; port: number; identityFile?: string; proxyJump?: string };

/** The concrete Host entries of an ~/.ssh/config (patterns with * or ? are skipped). */
export const parseSshConfig = (text: string): SshConfigHost[] => {
  const hosts: SshConfigHost[] = [];
  let current: SshConfigHost[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = /^(\S+)\s*(?:=\s*|\s+)(.+)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim().replace(/^"(.*)"$/, '$1');
    if (key === 'host') {
      current = value
        .split(/\s+/)
        .filter((alias) => !/[*?!]/.test(alias))
        .map((alias) => ({ alias, hostName: alias, port: 22 }));
      hosts.push(...current);
    } else if (key === 'match') {
      current = [];
    } else {
      for (const host of current) {
        // The first value wins, as in OpenSSH.
        if (key === 'hostname' && host.hostName === host.alias) host.hostName = value;
        else if (key === 'user') host.user ??= value;
        else if (key === 'port' && host.port === 22) host.port = Number(value) || 22;
        else if (key === 'identityfile') host.identityFile ??= value;
        else if (key === 'proxyjump') host.proxyJump ??= value;
      }
    }
  }
  return hosts;
};

/** The SSH hops to reach a host of the config, with its ProxyJump chain first ("user@host:port" or an alias). */
export const sshHopsFor = (hosts: SshConfigHost[], alias: string, seen = new Set<string>()): HopProfile[] => {
  const host = hosts.find((h) => h.alias === alias);
  const toHop = (h: SshConfigHost): HopProfile => ({
    kind: 'ssh',
    host: h.hostName,
    port: h.port,
    user: h.user ?? '',
    auth: h.identityFile ? 'key' : 'agent',
    privateKeyPath: h.identityFile,
  });
  if (!host || seen.has(alias)) return [];
  seen.add(alias);
  const jumps =
    host.proxyJump && host.proxyJump.toLowerCase() !== 'none'
      ? host.proxyJump.split(',').flatMap((jump) => {
          const known = hosts.find((h) => h.alias === jump.trim());
          if (known) return sshHopsFor(hosts, known.alias, seen);
          const m = /^(?:([^@]+)@)?([^:]+)(?::(\d+))?$/.exec(jump.trim());
          return m ? [toHop({ alias: m[2], hostName: m[2], user: m[1], port: Number(m[3]) || 22 })] : [];
        })
      : [];
  return [...jumps, toHop(host)];
};

/** "[host]:port" or "host" (port 22), as the desktop side names an SSH host in its errors. */
export const sshHostLabel = (host: string, port: number) => (port === 22 ? host : `[${host}]:${port}`);
