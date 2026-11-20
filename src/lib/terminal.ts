// Calls to the desktop side for saved VMs and their terminals. Only used when isDesktop() is true.
import { Channel, invoke } from '@tauri-apps/api/core';
import { VM_SECRET_SLOT, vmRoute, type SshHost } from '../domain/ssh-hosts';
import useConnectionStore from '../stores/use-connection-store';
import type { ConnectionReport } from './connections';

export type TerminalMessage = { kind: 'output'; data: string } | { kind: 'exit'; code: number | null };

export type TerminalOpened = { terminalId: number | null; report: ConnectionReport };

const spec = (host: SshHost, secret?: string, command?: string) => ({
  hops: vmRoute(useConnectionStore.getState().sshHosts, host, secret),
  command,
  timeoutSecs: 15,
});

const appError = (error: unknown): ConnectionReport => ({
  steps: [],
  serverVersion: null,
  error: { code: 'app', message: error instanceof Error ? error.message : String(error) },
});

/** Reaches the VM and signs in; a typed secret wins over the one in the keychain. */
export const testVm = async (host: SshHost, secret?: string): Promise<ConnectionReport> => {
  try {
    return await invoke<ConnectionReport>('vm_test', { spec: spec(host, secret), connectionId: null });
  } catch (error) {
    return appError(error);
  }
};

/** Saves (a value) or removes (null) the VM's secret in the keychain. */
export const saveVmSecret = (id: string, secret: string | null) => invoke('secrets_save', { connectionId: id, secrets: { [VM_SECRET_SLOT]: secret } });

export const deleteVmSecret = (id: string) => invoke('secrets_delete', { connectionId: id });

/** "SGVsbG8=" → the bytes, so a character split between two packets reaches the terminal whole. */
export const decodeOutput = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

/** Opens a terminal on the VM; `onMessage` receives its output and its end. */
export const openTerminal = async (
  host: SshHost,
  command: string | undefined,
  cols: number,
  rows: number,
  onMessage: (message: TerminalMessage) => void,
): Promise<TerminalOpened> => {
  const channel = new Channel<TerminalMessage>();
  channel.onmessage = onMessage;
  try {
    return await invoke<TerminalOpened>('terminal_open', { spec: spec(host, undefined, command), connectionId: null, cols, rows, onEvent: channel });
  } catch (error) {
    return { terminalId: null, report: appError(error) };
  }
};

export const writeTerminal = (terminalId: number, data: string) => invoke('terminal_write', { terminalId, data });

export const resizeTerminal = (terminalId: number, cols: number, rows: number) => invoke('terminal_resize', { terminalId, cols, rows });

export const closeTerminal = (terminalId: number) => invoke('terminal_close', { terminalId });
