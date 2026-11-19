import { describe, expect, it } from 'vitest';
import { parseConnectionUrl, parseSshConfig, sshHopsFor, toConnectionConfig, type ConnectionProfile } from './connections';

const profile = (overrides: Partial<ConnectionProfile> = {}): ConnectionProfile => ({
  id: 'c1',
  name: 'Tienda',
  environment: 'local',
  engine: 'postgres',
  host: ' db.internal ',
  port: 5432,
  database: 'tienda',
  user: 'app',
  tls: { mode: 'verifyFull', caPem: '' },
  hops: [],
  timeoutSecs: 15,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('parseConnectionUrl', () => {
  it('reads every part and the sslmode', () => {
    expect(parseConnectionUrl('postgresql://ana:p%40ss@db.example.com:6543/ventas?sslmode=verify-full')).toEqual({
      engine: 'postgres',
      host: 'db.example.com',
      port: 6543,
      database: 'ventas',
      user: 'ana',
      password: 'p@ss',
      tlsMode: 'verifyFull',
    });
  });

  it('uses the defaults and ignores other text', () => {
    expect(parseConnectionUrl('postgres://localhost')).toMatchObject({ port: 5432, database: 'postgres', user: '', password: undefined, tlsMode: undefined });
    expect(parseConnectionUrl('postgres://[::1]:5433/x')).toMatchObject({ host: '::1', port: 5433 });
    expect(parseConnectionUrl('ftp://localhost')).toBeNull();
    expect(parseConnectionUrl('db.example.com')).toBeNull();
  });

  it('reads MySQL, MariaDB and SQL Server too', () => {
    expect(parseConnectionUrl('mysql://root:pw@db:3307/shop?ssl-mode=VERIFY_IDENTITY')).toMatchObject({
      engine: 'mysql',
      port: 3307,
      database: 'shop',
      user: 'root',
      password: 'pw',
      tlsMode: 'verifyFull',
    });
    expect(parseConnectionUrl('mariadb://db/shop')).toMatchObject({ engine: 'mysql', port: 3306 });
    expect(parseConnectionUrl('sqlserver://sa@sql.local/ventas')).toMatchObject({ engine: 'sqlserver', port: 1433, database: 'ventas', user: 'sa' });
    expect(
      parseConnectionUrl('Server=tcp:srv.database.windows.net,1433;Initial Catalog=ventas;User ID=app;Password=x;Encrypt=True;TrustServerCertificate=False'),
    ).toEqual({
      engine: 'sqlserver',
      host: 'srv.database.windows.net',
      port: 1433,
      database: 'ventas',
      user: 'app',
      password: 'x',
      tlsMode: 'verifyFull',
      instance: undefined,
      integratedAuth: undefined,
    });
    expect(parseConnectionUrl('Data Source=.\\SQLEXPRESS;Database=tienda;Integrated Security=SSPI')).toMatchObject({
      host: 'localhost',
      port: 0,
      instance: 'SQLEXPRESS',
      integratedAuth: true,
    });
  });
});

describe('parseSshConfig', () => {
  const config = `
# Office bastion
Host bastion
  HostName bastion.example.com
  User ops
  IdentityFile ~/.ssh/id_ed25519

Host db-box internal
  HostName 10.0.0.5
  Port 2222
  ProxyJump bastion

Host *.example.com
  User nobody

Host far
  HostName far.example.com
  ProxyJump admin@jump1:2200,bastion
`;

  it('reads the concrete hosts and skips patterns', () => {
    const hosts = parseSshConfig(config);
    expect(hosts.map((h) => h.alias)).toEqual(['bastion', 'db-box', 'internal', 'far']);
    expect(hosts.find((h) => h.alias === 'internal')).toMatchObject({ hostName: '10.0.0.5', port: 2222, proxyJump: 'bastion' });
  });

  it('builds the hops with the ProxyJump chain first', () => {
    const hosts = parseSshConfig(config);
    expect(sshHopsFor(hosts, 'db-box')).toEqual([
      { kind: 'ssh', host: 'bastion.example.com', port: 22, user: 'ops', auth: 'key', privateKeyPath: '~/.ssh/id_ed25519' },
      { kind: 'ssh', host: '10.0.0.5', port: 2222, user: '', auth: 'agent', privateKeyPath: undefined },
    ]);
    expect(sshHopsFor(hosts, 'far').map((h) => h.host)).toEqual(['jump1', 'bastion.example.com', 'far.example.com']);
    expect(sshHopsFor(hosts, 'missing')).toEqual([]);
  });
});

describe('toConnectionConfig', () => {
  it('sends the secrets typed and leaves the rest for the keychain', () => {
    const config = toConnectionConfig(
      profile({
        hops: [
          { kind: 'httpConnect', host: 'proxy', port: 3128, username: 'me' },
          { kind: 'ssh', host: 'bastion', port: 22, user: 'ops', auth: 'key', privateKeyPath: '~/.ssh/id', hostKey: 'SHA256:x' },
          { kind: 'ssh', host: 'inner', port: 22, user: 'ops', auth: 'password' },
          { kind: 'socks4', host: 's4', port: 1080, userId: '' },
        ],
      }),
      { db: '', hops: ['proxy-pass', '', 'ssh-pass', ''] },
    );
    expect(config.host).toBe('db.internal');
    expect(config.password).toBeUndefined();
    expect(config.tls).toEqual({ mode: 'verifyFull', caPem: undefined, serverName: undefined, clientCertPem: undefined, clientKeyPem: undefined });
    expect(config.hops).toEqual([
      { kind: 'httpConnect', host: 'proxy', port: 3128, username: 'me', password: 'proxy-pass' },
      { kind: 'ssh', host: 'bastion', port: 22, user: 'ops', auth: { method: 'key', privateKeyPath: '~/.ssh/id', passphrase: undefined }, hostKey: 'SHA256:x' },
      { kind: 'ssh', host: 'inner', port: 22, user: 'ops', auth: { method: 'password', password: 'ssh-pass' }, hostKey: undefined },
      { kind: 'socks4', host: 's4', port: 1080, userId: undefined },
    ]);
  });
});
