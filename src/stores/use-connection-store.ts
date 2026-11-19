import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConnectionProfile } from '../domain/connections';

type ConnectionState = {
  /** Saved connections, without secrets (those live in the system keychain). */
  connections: ConnectionProfile[];
  /** The connection dialog: closed, a new connection, or the id being edited. */
  dialog: { open: boolean; id?: string };
  save: (profile: ConnectionProfile) => void;
  remove: (id: string) => void;
  openDialog: (id?: string) => void;
  closeDialog: () => void;
};

const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      connections: [],
      dialog: { open: false },
      save: (profile) =>
        set((s) => ({
          connections: s.connections.some((c) => c.id === profile.id)
            ? s.connections.map((c) => (c.id === profile.id ? profile : c))
            : [...s.connections, profile],
        })),
      remove: (id) => set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),
      openDialog: (id) => set({ dialog: { open: true, id } }),
      closeDialog: () => set({ dialog: { open: false } }),
    }),
    {
      name: 'er-studio:connections',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ connections: s.connections }),
    },
  ),
);

export default useConnectionStore;
