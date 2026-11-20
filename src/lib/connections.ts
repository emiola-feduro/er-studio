// Calls to the desktop side for database connections. Only used when isDesktop() is true.
import { invoke } from '@tauri-apps/api/core';
import type { ConnectionEngine, ConnectionProfile, ConnectionSecrets } from '../domain/connections';
import { secretSlot, toConnectionConfig, WALLET_SLOT } from '../domain/connections';
import { postgresCell, type RowSource } from '../domain/import/copy-rows';
import type { Ir } from '../domain/import/ir';

export type ConnectionErrorInfo =
  | { code: 'unreachable'; target: string; message: string }
  | { code: 'timeout'; step: ConnectionStep['kind']; target: string; seconds: number }
  | { code: 'proxyRefused'; target: string; message: string }
  | { code: 'unknownHostKey'; host: string; fingerprint: string }
  | { code: 'hostKeyChanged'; host: string; expected: string; actual: string }
  | { code: 'sshAuthFailed'; host: string; user: string; message: string }
  | { code: 'invalidKey'; message: string }
  | { code: 'tunnelRefused'; target: string; message: string }
  | { code: 'tlsConfig'; message: string }
  | { code: 'database'; message: string; sqlState?: string | null }
  | { code: 'writesDisabled' | 'notReadOnly' | 'pendingWrite' | 'nothingPending' | 'sessionClosed' }
  | { code: 'unsupported'; message: string }
  | { code: 'app'; message: string };

export type ConnectionStep = { kind: 'tcp' | 'socket' | 'file' | 'ssh' | 'socks5' | 'socks4' | 'http' | 'database'; target: string; ms: number };

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
export const saveSecrets = async (id: string, secrets: ConnectionSecrets, hopsWithoutSecret: number[], withoutWallet = false) => {
  const values: Record<string, string | null> = {};
  if (secrets.db) values[secretSlot()] = secrets.db;
  // A connection without a wallet drops the wallet password it had.
  if (withoutWallet) values[WALLET_SLOT] = null;
  else if (secrets.wallet) values[WALLET_SLOT] = secrets.wallet;
  secrets.hops.forEach((value, index) => {
    if (value) values[secretSlot(index)] = value;
  });
  // A hop that no longer takes a secret (agent auth, no proxy user) drops the one it had.
  for (const index of hopsWithoutSecret) values[secretSlot(index)] = null;
  await invoke('secrets_save', { connectionId: id, secrets: values });
};

export const deleteSecrets = (id: string) => invoke('secrets_delete', { connectionId: id });

export const readSshConfig = () => invoke<string | null>('ssh_config_read');

/** The tnsnames.ora aliases of an Oracle wallet (zip or folder). */
export const readWalletAliases = (path: string) => invoke<string[]>('oracle_wallet_aliases', { path });

/* Open sessions: reading a schema and its rows over one connection */

export type SchemaInfo = { name: string; tables: number };
export type TableSource = { name: string; schema: string; table: string; key: string[] };
export type SchemaRead = { ir: Ir; sources: TableSource[] };
export type Opened = { sessionId: number | null; report: ConnectionReport };

/** Errors of session commands come as the JSON of the desktop error; this gives its message. */
export const sessionErrorMessage = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message ?? text;
  } catch {
    return text;
  }
};

export const openSession = async (profile: ConnectionProfile, savedId?: string): Promise<Opened> => {
  try {
    return await invoke<Opened>('connection_open', { config: toConnectionConfig(profile), connectionId: savedId ?? null });
  } catch (error) {
    return { sessionId: null, report: appError(error) };
  }
};

export const closeSession = (sessionId: number) => invoke('connection_close', { sessionId }).catch(() => undefined);

export const listSchemas = (sessionId: number) => invoke<SchemaInfo[]>('session_schemas', { sessionId });

export const readSchema = (sessionId: number, schemas: string[]) => invoke<SchemaRead>('session_schema', { sessionId, schemas });

/** The tables of an open PostgreSQL session as a source of rows for copyRows. */
export const sessionRowSource = (sessionId: number, sources: TableSource[], engine: ConnectionEngine = 'postgres'): RowSource => {
  const byName = new Map(sources.map((s) => [s.name.toLowerCase(), s]));
  return {
    has: (name) => byName.has(name.toLowerCase()),
    fetch: async (name, offset, limit) => {
      const source = byName.get(name.toLowerCase())!;
      const page = await invoke<{ columns: string[]; rows: (string | null)[][] }>('session_rows', {
        sessionId,
        schema: source.schema,
        table: source.table,
        orderBy: source.key,
        offset,
        limit,
      });
      return { columns: page.columns, values: page.rows };
    },
    cell: engine === 'postgres' ? postgresCell : (value) => String(value),
  };
};

/* Live queries */

export type LiveRun = { columns: string[]; rows: (string | null)[][]; rowsAffected: number | null; truncated: boolean; ms: number; pending: boolean };

export const runLive = (sessionId: number, sql: string, write: boolean, maxRows: number) => invoke<LiveRun>('query_run', { sessionId, sql, write, maxRows });

export const finishLive = (sessionId: number, commit: boolean) => invoke('query_finish', { sessionId, commit });

export const runScript = (sessionId: number, sql: string) => invoke('session_script', { sessionId, sql });

/** The code of a desktop error ("sessionClosed", "writesDisabled"...), when the error is one. */
export const sessionErrorCode = (error: unknown): string | undefined => {
  const text = error instanceof Error ? error.message : String(error);
  try {
    return (JSON.parse(text) as { code?: string }).code;
  } catch {
    return undefined;
  }
};
