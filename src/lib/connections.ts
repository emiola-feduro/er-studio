// Calls to the desktop side for database connections. Only used when isDesktop() is true.
import { invoke } from '@tauri-apps/api/core';
import type { ConnectionProfile, ConnectionSecrets } from '../domain/connections';
import { secretSlot, toConnectionConfig } from '../domain/connections';

export type ConnectionErrorInfo =
  | { code: 'unreachable'; target: string; message: string }
  | { code: 'timeout'; step: string; seconds: number }
  | { code: 'proxyRefused'; target: string; message: string }
  | { code: 'unknownHostKey'; host: string; fingerprint: string }
  | { code: 'hostKeyChanged'; host: string; expected: string; actual: string }
  | { code: 'sshAuthFailed'; host: string; user: string; message: string }
  | { code: 'invalidKey'; message: string }
  | { code: 'tunnelRefused'; target: string; message: string }
  | { code: 'tlsConfig'; message: string }
  | { code: 'database'; message: string; sqlState?: string | null }
  | { code: 'app'; message: string };

export type ConnectionStep = { kind: 'tcp' | 'ssh' | 'socks5' | 'socks4' | 'http' | 'database'; target: string; ms: number };

export type ConnectionReport = { steps: ConnectionStep[]; serverVersion: string | null; error: ConnectionErrorInfo | null };

const appError = (error: unknown): ConnectionReport => ({
  steps: [],
  serverVersion: null,
  error: { code: 'app', message: error instanceof Error ? error.message : String(error) },
});

/** Opens the connection once, filling the secrets left empty from the keychain of `savedId`. */
export const testConnection = async (profile: ConnectionProfile, secrets: ConnectionSecrets, savedId?: string): Promise<ConnectionReport> => {
  try {
    return await invoke<ConnectionReport>('connection_test', { config: toConnectionConfig(profile, secrets), connectionId: savedId ?? null });
  } catch (error) {
    return appError(error);
  }
};

/** Saves the secrets that were typed; blank ones keep what the keychain already has. */
export const saveSecrets = async (id: string, secrets: ConnectionSecrets, hopsWithoutSecret: number[]) => {
  const values: Record<string, string | null> = {};
  if (secrets.db) values[secretSlot()] = secrets.db;
  secrets.hops.forEach((value, index) => {
    if (value) values[secretSlot(index)] = value;
  });
  // A hop that no longer takes a secret (agent auth, no proxy user) drops the one it had.
  for (const index of hopsWithoutSecret) values[secretSlot(index)] = null;
  await invoke('secrets_save', { connectionId: id, secrets: values });
};

export const deleteSecrets = (id: string) => invoke('secrets_delete', { connectionId: id });

export const readSshConfig = () => invoke<string | null>('ssh_config_read');
