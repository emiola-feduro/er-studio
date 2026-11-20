import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConnectionProfile } from '../domain/connections';
import type { SshHost } from '../domain/ssh-hosts';

type ConnectionState = {
  /** Saved connections, without secrets (those live in the system keychain). */
  connections: ConnectionProfile[];
  /** Saved VMs, reused as route steps and to open terminals (their secrets live in the keychain too). */
  sshHosts: SshHost[];
  /** The VM dialog: closed, a new VM, or the id being edited. */
  hostDialog: { open: boolean; id?: string };
  saveHost: (host: SshHost) => void;
  /** Removes a VM; connections that went through it keep the step as a plain SSH hop. */
  removeHost: (id: string) => void;
  openHostDialog: (id?: string) => void;
  closeHostDialog: () => void;
  /** The connection dialog: closed, a new connection, or the id being edited. */
  dialog: { open: boolean; id?: string };
  /** The "new project from a connection" dialog and the connection it reads. */
  importFrom: string | null;
  openImport: (id: string) => void;
  closeImport: () => void;
  save: (profile: ConnectionProfile) => void;
  remove: (id: string) => void;
  openDialog: (id?: string) => void;
  closeDialog: () => void;
};

const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      connections: [],
      sshHosts: [],
      hostDialog: { open: false },
      dialog: { open: false },
      saveHost: (host) =>
        set((s) => ({ sshHosts: s.sshHosts.some((h) => h.id === host.id) ? s.sshHosts.map((h) => (h.id === host.id ? host : h)) : [...s.sshHosts, host] })),
      removeHost: (id) =>
        set((s) => {
          const gone = s.sshHosts.find((h) => h.id === id);
          return {
            sshHosts: s.sshHosts.filter((h) => h.id !== id).map((h) => (h.viaId === id ? { ...h, viaId: gone?.viaId } : h)),
            connections: s.connections.map((c) =>
              c.hops.some((hop) => hop.kind === 'vm' && hop.hostId === id)
                ? {
                    ...c,
                    hops: c.hops.map((hop) =>
                      hop.kind === 'vm' && hop.hostId === id && gone
                        ? {
                            kind: 'ssh' as const,
                            host: gone.host,
                            port: gone.port,
                            user: gone.user,
                            auth: gone.auth,
                            privateKeyPath: gone.privateKeyPath,
                            hostKey: gone.hostKey,
                          }
                        : hop,
                    ),
                  }
                : c,
            ),
          };
        }),
      openHostDialog: (id) => set({ hostDialog: { open: true, id } }),
      closeHostDialog: () => set({ hostDialog: { open: false } }),
      importFrom: null,
      openImport: (id) => set({ importFrom: id }),
      closeImport: () => set({ importFrom: null }),
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ connections: s.connections, sshHosts: s.sshHosts }),
      // Version 1 had no saved VMs.
      migrate: (state) => ({ sshHosts: [], ...(state as object) }) as unknown as ConnectionState,
    },
  ),
);

export default useConnectionStore;
