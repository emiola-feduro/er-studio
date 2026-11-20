import { vmRoute, type SshHost } from './ssh-hosts';
import type { DialectId } from './types';

/**
 * Saved database connections (desktop only). A profile holds everything but the secrets: passwords,
 * passphrases and proxy passwords go to the system keychain and come back only inside the desktop app.
 */

export type ConnectionEngine = 'postgres' | 'mysql' | 'sqlserver' | 'oracle' | 'sqlite';

export const ENGINES: ConnectionEngine[] = ['postgres', 'mysql', 'sqlserver', 'oracle', 'sqlite'];

/** The gestor of the projects made from a connection. */
export const ENGINE_DIALECT: Record<ConnectionEngine, DialectId> = {
  postgres: 'postgresql',
  mysql: 'mysql',
  sqlserver: 'sqlserver',
  oracle: 'oracle',
  sqlite: 'sqlite',
};

export type ConnectionEnvironment = 'local' | 'development' | 'staging' | 'production';

export const ENVIRONMENTS: ConnectionEnvironment[] = ['local', 'development', 'staging', 'production'];

export type TlsMode = 'disable' | 'prefer' | 'require' | 'verifyCa' | 'verifyFull';

export const TLS_MODES: TlsMode[] = ['disable', 'prefer', 'require', 'verifyCa', 'verifyFull'];

/** Oracle speaks TLS or not on each port, and always checks the certificate when it does. */
export const ORACLE_TLS_MODES: TlsMode[] = ['disable', 'verifyFull'];

/** How an Oracle connection names its database: a service name, a SID, or a whole connect string (or wallet alias). */
export type OracleConnectBy = 'service' | 'sid' | 'connectString';

export const ORACLE_CONNECT_BY: OracleConnectBy[] = ['service', 'sid', 'connectString'];

export type OracleRole = 'sysdba' | 'sysoper';

export type SshAuthMethod = 'password' | 'key' | 'agent';

export type HopProfile =
  | { kind: 'ssh'; host: string; port: number; user: string; auth: SshAuthMethod; privateKeyPath?: string; hostKey?: string }
  | { kind: 'socks5'; host: string; port: number; username?: string }
  | { kind: 'socks4'; host: string; port: number; userId?: string }
  | { kind: 'httpConnect'; host: string; port: number; username?: string };

export type HopKind = HopProfile['kind'];

/** A saved VM as a step of the route; its address, user and secret come from the VM. */
export type VmHop = { kind: 'vm'; hostId: string };

export type RouteHop = HopProfile | VmHop;

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
  hops: RouteHop[];
  timeoutSecs: number;
  /** Without it, every statement runs in a transaction that is rolled back. */
  allowWrites?: boolean;
  /** SQL Server: named instance (its port comes from SQL Browser when the port is 0) and Windows authentication. */
  instance?: string;
  integratedAuth?: boolean;
  /** SQLite: the file, and whether to open it read-only. */
  file?: string;
  readOnlyFile?: boolean;
  /** Oracle: how the database is named, the connect string or alias, the wallet (zip or folder) and the privilege. */
  oracleConnectBy?: OracleConnectBy;
  connectString?: string;
  wallet?: string;
  role?: OracleRole;
  createdAt: number;
  updatedAt: number;
};

/** Secrets typed in the dialog: the database password, an Oracle wallet password and one per hop (password, passphrase or proxy password). */
export type ConnectionSecrets = { db: string; hops: string[]; wallet?: string };

export const DEFAULT_PORTS: Record<HopKind | ConnectionEngine, number> = {
  postgres: 5432,
  mysql: 3306,
  sqlserver: 1433,
  oracle: 1521,
  sqlite: 0,
  ssh: 22,
  socks5: 1080,
  socks4: 1080,
  httpConnect: 3128,
};

export const DEFAULT_USERS: Record<ConnectionEngine, string> = { postgres: 'postgres', mysql: 'root', sqlserver: 'sa', oracle: 'system', sqlite: '' };

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

/** Whether a hop takes a secret of the connection, and which one the field asks for (a saved VM keeps its own). */
export const hopSecret = (hop: RouteHop): 'password' | 'passphrase' | null => {
  if (hop.kind === 'vm') return null;
  if (hop.kind === 'ssh') return hop.auth === 'password' ? 'password' : hop.auth === 'key' ? 'passphrase' : null;
  if (hop.kind === 'socks5' || hop.kind === 'httpConnect') return hop.username ? 'password' : null;
  return null;
};

/** Keychain slot of each secret, the same names the desktop side uses. */
export const secretSlot = (index?: number) => (index === undefined ? 'db' : `hop${index}`);

/**
 * The slot number of a hop's secret: its place among the hops that are not saved VMs, as the desktop
 * side counts them (saved VMs keep their secret apart). Without VMs it is the hop's own index.
 */
export const hopSlot = (hops: RouteHop[], index: number) => hops.slice(0, index).filter((h) => h.kind !== 'vm').length;

export const WALLET_SLOT = 'wallet';

/** Whether an Oracle profile names its database with a connect string or alias instead of host, port and service. */
export const usesConnectString = (profile: Pick<ConnectionProfile, 'engine' | 'oracleConnectBy'>) =>
  profile.engine === 'oracle' && profile.oracleConnectBy === 'connectString';

const filled = (value: string | undefined) => (value && value.length > 0 ? value : undefined);

/** The settings the desktop side receives. Empty secrets are left out so it fills them from the keychain. */
export const toConnectionConfig = (profile: ConnectionProfile, secrets?: ConnectionSecrets, hosts: SshHost[] = []) => ({
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
  hops: profile.hops.flatMap<object>((hop, index) => {
    const secret = filled(secrets?.hops[index]);
    switch (hop.kind) {
      case 'vm': {
        // A VM that was deleted leaves no step; the test then reports the server as unreachable.
        const host = hosts.find((h) => h.id === hop.hostId);
        return host ? vmRoute(hosts, host) : [];
      }
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
  allowWrites: Boolean(profile.allowWrites),
  instance: filled(profile.instance?.trim()),
  integratedAuth: Boolean(profile.integratedAuth),
  file: filled(profile.file?.trim()),
  readOnlyFile: Boolean(profile.readOnlyFile),
  ...(profile.engine === 'oracle'
    ? {
        connectString: usesConnectString(profile) ? filled(profile.connectString?.trim()) : undefined,
        sid: profile.oracleConnectBy === 'sid',
        wallet: filled(profile.wallet?.trim()),
        walletPassword: profile.wallet?.trim() ? filled(secrets?.wallet) : undefined,
        role: profile.role,
      }
    : {}),
});

const SSL_MODES: Record<string, TlsMode> = {
  disable: 'disable',
  allow: 'prefer',
  prefer: 'prefer',
  require: 'require',
  'verify-ca': 'verifyCa',
  'verify-full': 'verifyFull',
  // MySQL spells them differently.
  disabled: 'disable',
  preferred: 'prefer',
  required: 'require',
  'verify-identity': 'verifyFull',
};

export type ParsedUrl = Pick<ConnectionProfile, 'engine' | 'host' | 'port' | 'database' | 'user'> & {
  password?: string;
  tlsMode?: TlsMode;
  instance?: string;
  integratedAuth?: boolean;
  oracleConnectBy?: OracleConnectBy;
  connectString?: string;
};

const SCHEMES: Record<string, ConnectionEngine> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
};

/** "Server=host,1433;Database=x;User Id=u;Password=p;Encrypt=True" (ADO.NET, as SQL Server tools give it). */
const parseAdoNet = (text: string): ParsedUrl | null => {
  const pairs = new Map(
    text
      .split(';')
      .map((part) => part.split('='))
      .filter((kv) => kv.length >= 2)
      .map(([key, ...value]) => [key.trim().toLowerCase().replace(/\s+/g, ' '), value.join('=').trim()] as const),
  );
  const server = pairs.get('server') ?? pairs.get('data source') ?? pairs.get('address');
  if (!server) return null;
  const [hostPart, portPart] = server.replace(/^tcp:/i, '').split(',');
  const [host, instance] = hostPart.split('\\');
  const encrypt = pairs.get('encrypt')?.toLowerCase();
  const trust = pairs.get('trustservercertificate')?.toLowerCase() === 'true';
  const integrated = ['true', 'sspi', 'yes'].includes((pairs.get('integrated security') ?? pairs.get('trusted_connection') ?? '').toLowerCase());
  return {
    engine: 'sqlserver',
    host: host.trim() === '.' || host.trim() === '(local)' ? 'localhost' : host.trim(),
    port: portPart ? Number(portPart) : instance ? 0 : DEFAULT_PORTS.sqlserver,
    database: pairs.get('database') ?? pairs.get('initial catalog') ?? 'master',
    user: pairs.get('user id') ?? pairs.get('uid') ?? pairs.get('user') ?? '',
    password: pairs.get('password') ?? pairs.get('pwd'),
    tlsMode: encrypt === 'false' || encrypt === 'optional' ? 'prefer' : encrypt ? (trust ? 'require' : 'verifyFull') : undefined,
    instance: instance?.trim() || undefined,
    integratedAuth: integrated || undefined,
  };
};

/**
 * Oracle in the forms its tools give: JDBC thin ("jdbc:oracle:thin:@//host:1521/service", "@host:1521:SID",
 * "@(DESCRIPTION=...)", "@alias"), Easy Connect ("host:1521/service", "tcps://host:2484/service"), SQL*Plus
 * ("user/password@host:1521/service"), oracle:// URLs and bare connect descriptors.
 */
export const parseOracle = (text: string): ParsedUrl | null => {
  let rest = text.trim();
  const scheme = /^([a-z]+):\/\//i.exec(rest)?.[1]?.toLowerCase();
  if (scheme && !['tcp', 'tcps', 'oracle'].includes(scheme)) return null;
  let user = '';
  let password: string | undefined;
  const base = { engine: 'oracle' as const, host: '', port: DEFAULT_PORTS.oracle, database: '', user };
  const jdbc = /^jdbc:oracle:thin:/i.test(rest);
  if (jdbc) rest = rest.replace(/^jdbc:oracle:thin:/i, '');
  const oracleUrl = /^oracle:\/\//i.exec(rest);
  if (oracleUrl) {
    try {
      const url = new URL(rest.replace(/^oracle:/i, 'http:'));
      return {
        ...base,
        host: url.hostname,
        port: url.port ? Number(url.port) : DEFAULT_PORTS.oracle,
        database: decodeURIComponent(url.pathname.replace(/^\//, '')),
        user: decodeURIComponent(url.username),
        password: url.password ? decodeURIComponent(url.password) : undefined,
        oracleConnectBy: 'service',
      };
    } catch {
      return null;
    }
  }
  // "user/password@" before the address (SQL*Plus and JDBC both allow it).
  const credentials = /^([^/@\s()]+)(?:\/([^@\s]*))?@(.+)$/s.exec(rest);
  if (credentials) {
    user = credentials[1];
    password = credentials[2] || undefined;
    rest = credentials[3];
  } else if (rest.startsWith('@')) {
    rest = rest.slice(1);
  } else if (jdbc) {
    return null;
  }
  rest = rest.trim();
  if (/^\(\s*DESCRIPTION/i.test(rest) || /^\(\s*DESCRIPTION_LIST/i.test(rest)) {
    return { ...base, user, password, oracleConnectBy: 'connectString', connectString: rest };
  }
  const easy = /^(?:(tcps?):\/\/)?(?:\/\/)?(\[[^\]]+\]|[^:/\s?]+)(?::(\d+))?(?:([/:])([\w.$#-][^?\s]*))?(?:\?.*)?$/i.exec(rest);
  if (!easy) return null;
  const [, protocol, rawHost, port, separator, name] = easy;
  // Without a service, a single word is a tnsnames.ora alias ("mydb_high").
  if (!separator && !port && !protocol) {
    if (!jdbc && !credentials) return null;
    return { ...base, user, password, oracleConnectBy: 'connectString', connectString: rawHost };
  }
  return {
    ...base,
    host: rawHost.replace(/^\[|\]$/g, ''),
    port: port ? Number(port) : protocol?.toLowerCase() === 'tcps' ? 2484 : DEFAULT_PORTS.oracle,
    database: name ?? '',
    user,
    password,
    // "host:port:SID" is the old JDBC form; "host:port/service" names a service.
    oracleConnectBy: separator === ':' ? 'sid' : 'service',
    tlsMode: protocol?.toLowerCase() === 'tcps' ? 'verifyFull' : protocol ? 'disable' : undefined,
  };
};

/**
 * Reads a connection URL ("postgres://user:password@host:5432/db?sslmode=verify-full", mysql://, mariadb://,
 * sqlserver://) or a SQL Server connection string. Null when it is none of them.
 */
export const parseConnectionUrl = (text: string): ParsedUrl | null => {
  const trimmed = text.trim();
  const scheme = /^([a-z]+):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  const engine = scheme ? SCHEMES[scheme] : undefined;
  if (!engine) {
    if (/server\s*=|data source\s*=/i.test(trimmed)) return parseAdoNet(trimmed);
    return parseOracle(trimmed);
  }
  let url: URL;
  try {
    // URL only parses special schemes fully, so read it as http with the same parts.
    url = new URL(trimmed.replace(/^[a-z]+:/i, 'http:'));
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
  const sslmode = (url.searchParams.get('sslmode') ?? url.searchParams.get('ssl-mode'))?.toLowerCase().replace(/_/g, '-');
  return {
    engine,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : DEFAULT_PORTS[engine],
    database: decode(url.pathname.replace(/^\//, '')) || (engine === 'postgres' ? 'postgres' : engine === 'sqlserver' ? 'master' : ''),
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
