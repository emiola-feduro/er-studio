import { describe, expect, it } from 'vitest';
import { hopSlot, toConnectionConfig, type ConnectionProfile } from './connections';
import { shellCommand, viaOptions, vmChain, vmRoute, type SshHost } from './ssh-hosts';

const vm = (id: string, overrides: Partial<SshHost> = {}): SshHost => ({
  id,
  name: id,
  host: `${id}.example.com`,
  port: 22,
  user: 'ops',
  auth: 'password',
  shell: 'default',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const bastion = vm('bastion', { auth: 'agent', hostKey: 'SHA256:b' });
const app = vm('app', { viaId: 'bastion', auth: 'key', privateKeyPath: '~/.ssh/id_ed25519' });
const hosts = [bastion, app];

describe('saved VMs', () => {
  it('goes through its bastion first, and stops at a loop', () => {
    expect(vmChain(hosts, 'app').map((h) => h.id)).toEqual(['bastion', 'app']);
    const loop = [vm('a', { viaId: 'b' }), vm('b', { viaId: 'a' })];
    expect(vmChain(loop, 'a').map((h) => h.id)).toEqual(['b', 'a']);
    // A VM cannot jump through one that already passes through it.
    expect(viaOptions(hosts, 'bastion').map((h) => h.id)).toEqual([]);
    expect(viaOptions(hosts, 'app').map((h) => h.id)).toEqual(['bastion']);
  });

  it('builds the route with each VM keychain entry, and a typed secret only for the VM itself', () => {
    expect(vmRoute(hosts, app, 'frase')).toEqual([
      { kind: 'ssh', host: 'bastion.example.com', port: 22, user: 'ops', auth: { method: 'agent' }, hostKey: 'SHA256:b', secretId: 'bastion' },
      {
        kind: 'ssh',
        host: 'app.example.com',
        port: 22,
        user: 'ops',
        auth: { method: 'key', privateKeyPath: '~/.ssh/id_ed25519', passphrase: 'frase' },
        hostKey: undefined,
        secretId: 'app',
      },
    ]);
  });

  it('starts the login shell unless another one is chosen', () => {
    expect(shellCommand('default')).toBeUndefined();
    expect(shellCommand('zsh')).toBe('zsh -l');
    expect(shellCommand('powershell')).toBe('powershell.exe -NoLogo');
    expect(shellCommand('custom', '  tmux new -A -s main ')).toBe('tmux new -A -s main');
    expect(shellCommand('custom', ' ')).toBeUndefined();
  });

  it('expands a VM step of a connection and numbers the other secrets without it', () => {
    const profile: ConnectionProfile = {
      id: 'c1',
      name: 'Ventas',
      environment: 'local',
      engine: 'postgres',
      host: '10.0.0.5',
      port: 5432,
      database: 'ventas',
      user: 'app',
      tls: { mode: 'disable' },
      hops: [
        { kind: 'socks5', host: 'proxy', port: 1080, username: 'u' },
        { kind: 'vm', hostId: 'app' },
        { kind: 'httpConnect', host: 'http', port: 3128, username: 'h' },
      ],
      timeoutSecs: 15,
      createdAt: 0,
      updatedAt: 0,
    };
    const config = toConnectionConfig(profile, { db: '', hops: ['p1', '', 'p3'] }, hosts);
    expect(config.hops.map((h) => (h as { host: string }).host)).toEqual(['proxy', 'bastion.example.com', 'app.example.com', 'http']);
    expect((config.hops[3] as { password?: string }).password).toBe('p3');
    // The HTTP proxy is the second hop that is not a saved VM, as the desktop side counts.
    expect(hopSlot(profile.hops, 2)).toBe(1);
    expect(hopSlot(profile.hops, 0)).toBe(0);
    // A deleted VM leaves no step.
    expect(toConnectionConfig(profile, undefined, []).hops).toHaveLength(2);
  });
});
