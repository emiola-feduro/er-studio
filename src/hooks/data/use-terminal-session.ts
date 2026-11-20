import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { shellCommand, vmChain, vmLabel } from '../../domain/ssh-hosts';
import { t } from '../../i18n';
import type { ConnectionReport } from '../../lib/connections';
import { closeTerminal, decodeOutput, openTerminal, resizeTerminal, writeTerminal } from '../../lib/terminal';
import useConnectionStore from '../../stores/use-connection-store';
import usePreferencesStore from '../../stores/use-preferences-store';
import type { TerminalTab } from '../../stores/use-terminal-store';

export type TerminalStatus = { kind: 'connecting' } | { kind: 'open' } | { kind: 'failed'; report: ConnectionReport } | { kind: 'ended'; code: number | null };

/** The colors and font of the active theme, read from its CSS variables. */
const look = () => {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim();
  return {
    fontFamily: value('--font-sql') || 'monospace',
    theme: {
      background: value('--c-surface'),
      foreground: value('--c-fg'),
      cursor: value('--c-accent'),
      cursorAccent: value('--c-surface'),
      selectionBackground: `color-mix(in srgb, ${value('--c-accent')} 30%, transparent)`,
    },
  };
};

/**
 * One terminal tab: an xterm.js screen in `ref`, wired to an SSH session on the VM. Keystrokes go to the
 * VM, its output comes back as it arrives, and the screen follows the panel's size.
 */
const useTerminalSession = (tab: TerminalTab, visible: boolean) => {
  const ref = useRef<HTMLDivElement>(null);
  const screen = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const [status, setStatus] = useState<TerminalStatus>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);
  const theme = usePreferencesStore((s) => s.themeId);
  const textSize = usePreferencesStore((s) => s.textSize);

  useEffect(() => {
    const element = ref.current;
    const host = useConnectionStore.getState().sshHosts.find((h) => h.id === tab.hostId);
    if (!element) return;
    if (!host) {
      setStatus({ kind: 'failed', report: { steps: [], serverVersion: null, error: { code: 'app', message: t('vms.missing') } } });
      return;
    }
    const { fontFamily, theme: colors } = look();
    const term = new Terminal({ fontFamily, fontSize: 13, theme: colors, cursorBlink: true, scrollback: 5000 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    screen.current = { term, fit };
    const refit = () => {
      // A hidden panel has no size; fitting it would shrink the terminal to nothing.
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
    };
    refit();

    let id: number | null = null;
    let disposed = false;
    const typed = term.onData((data) => {
      if (id !== null) void writeTerminal(id, data).catch(() => undefined);
    });
    const resized = term.onResize(({ cols, rows }) => {
      if (id !== null) void resizeTerminal(id, cols, rows).catch(() => undefined);
    });
    const observer = new ResizeObserver(refit);
    observer.observe(element);

    setStatus({ kind: 'connecting' });
    void openTerminal(host, shellCommand(tab.shell, tab.customShell), term.cols, term.rows, (message) => {
      if (message.kind === 'output') term.write(decodeOutput(message.data));
      else setStatus({ kind: 'ended', code: message.code });
    }).then((opened) => {
      if (disposed) {
        if (opened.terminalId !== null) void closeTerminal(opened.terminalId);
        return;
      }
      if (opened.terminalId === null) {
        setStatus({ kind: 'failed', report: opened.report });
        return;
      }
      id = opened.terminalId;
      setStatus({ kind: 'open' });
      refit();
      void resizeTerminal(id, term.cols, term.rows).catch(() => undefined);
      term.focus();
    });

    return () => {
      disposed = true;
      observer.disconnect();
      typed.dispose();
      resized.dispose();
      term.dispose();
      screen.current = null;
      if (id !== null) void closeTerminal(id).catch(() => undefined);
    };
  }, [tab.key, tab.hostId, tab.shell, tab.customShell, attempt]);

  // Coming back to the tab: fit the panel as it is now and take the keyboard.
  useEffect(() => {
    if (!visible || !screen.current) return;
    const { term, fit } = screen.current;
    const element = ref.current;
    if (element && element.clientWidth > 0) fit.fit();
    term.focus();
  }, [visible]);

  // A new theme or text size repaints the terminal with it.
  useEffect(() => {
    if (!screen.current) return;
    const { fontFamily, theme: colors } = look();
    screen.current.term.options.theme = colors;
    screen.current.term.options.fontFamily = fontFamily;
  }, [theme, textSize]);

  const reconnect = useCallback(() => setAttempt((n) => n + 1), []);

  /** Accepts the fingerprint the failure reported, on the VM or on one it jumps through, and connects again. */
  const trust = useCallback(() => {
    if (status.kind !== 'failed') return;
    const error = status.report.error;
    if (!error || (error.code !== 'unknownHostKey' && error.code !== 'hostKeyChanged')) return;
    const fingerprint = error.code === 'unknownHostKey' ? error.fingerprint : error.actual;
    const { sshHosts, saveHost } = useConnectionStore.getState();
    const vm = vmChain(sshHosts, tab.hostId).find((h) => vmLabel(h) === error.host);
    if (!vm) return;
    saveHost({ ...vm, hostKey: fingerprint, updatedAt: Date.now() });
    setAttempt((n) => n + 1);
  }, [status, tab.hostId]);

  return { ref, status, reconnect, trust };
};

export default useTerminalSession;
