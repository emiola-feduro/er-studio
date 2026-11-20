import { create } from 'zustand';
import type { SshShell } from '../domain/ssh-hosts';

/** One terminal tab: which VM, with which program, and a key that stays the same while it lives. */
export type TerminalTab = { key: string; hostId: string; title: string; shell: SshShell; customShell?: string };

type TerminalState = {
  tabs: TerminalTab[];
  active: string | null;
  /** The panel shows while there are tabs, unless it was folded. */
  folded: boolean;
  /** The "new terminal" form in the panel. */
  choosing: boolean;
  open: (tab: Omit<TerminalTab, 'key'>) => void;
  close: (key: string) => void;
  activate: (key: string) => void;
  setFolded: (folded: boolean) => void;
  setChoosing: (choosing: boolean) => void;
};

let counter = 0;

/** Open terminals (desktop only). They live for the session: closing the app ends them. */
const useTerminalStore = create<TerminalState>()((set) => ({
  tabs: [],
  active: null,
  folded: false,
  choosing: false,
  open: (tab) => {
    counter += 1;
    const key = `t${counter}`;
    set((s) => {
      // A second terminal on the same VM is told apart by its number.
      const same = s.tabs.filter((t) => t.hostId === tab.hostId).length;
      const title = same > 0 ? `${tab.title} (${same + 1})` : tab.title;
      return { tabs: [...s.tabs, { ...tab, key, title }], active: key, folded: false, choosing: false };
    });
  },
  close: (key) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.key === key);
      const tabs = s.tabs.filter((t) => t.key !== key);
      const active = s.active === key ? (tabs[Math.min(index, tabs.length - 1)]?.key ?? null) : s.active;
      return { tabs, active };
    }),
  activate: (key) => set({ active: key, folded: false }),
  setFolded: (folded) => set({ folded }),
  setChoosing: (choosing) => set({ choosing, folded: false }),
}));

export default useTerminalStore;
