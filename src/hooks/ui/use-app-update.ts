import { useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { isDesktop } from '../../lib/platform';

/** First check a few seconds after start, so it does not compete with opening the app; then every 6 hours. */
const FIRST_CHECK_MS = 5_000;
const EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; percent: number | null }
  | { phase: 'ready'; version: string }
  | { phase: 'installing'; version: string };

/**
 * Desktop only: looks for a newer published release, downloads it in the background and leaves it ready
 * to install on restart. Network or signature problems are ignored and tried again on the next check.
 */
const useAppUpdate = () => {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const pending = useRef<Update | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!isDesktop()) return;
    const look = async () => {
      if (busy.current || pending.current) return;
      busy.current = true;
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update) return;
        let total = 0;
        let received = 0;
        setState({ phase: 'downloading', version: update.version, percent: null });
        await update.download((event) => {
          if (event.event === 'Started') total = event.data.contentLength ?? 0;
          if (event.event === 'Progress') {
            received += event.data.chunkLength;
            setState({ phase: 'downloading', version: update.version, percent: total ? Math.round((received / total) * 100) : null });
          }
        });
        pending.current = update;
        setState({ phase: 'ready', version: update.version });
      } catch {
        setState((s) => (s.phase === 'downloading' ? { phase: 'idle' } : s));
      } finally {
        busy.current = false;
      }
    };
    const first = setTimeout(() => void look(), FIRST_CHECK_MS);
    const timer = setInterval(() => void look(), EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  /** Installs the downloaded version and opens the app again. */
  const restart = async () => {
    const update = pending.current;
    if (!update) return;
    setState({ phase: 'installing', version: update.version });
    await update.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  };

  return {
    state,
    visible: state.phase !== 'idle' && !(dismissed && state.phase !== 'installing'),
    restart: () => void restart(),
    later: () => setDismissed(true),
  };
};

export default useAppUpdate;
