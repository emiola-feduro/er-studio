import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { vmChain, vmLabel } from '../../../domain/ssh-hosts';
import useT from '../../../hooks/ui/use-t';
import useConnectionStore from '../../../stores/use-connection-store';
import Button from '../button/button';
import IconButton from '../icon-button/icon-button';

type ConnectionDialogVmHopProps = { hostId: string; index: number; count: number; onMove: (by: -1 | 1) => void; onRemove: () => void };

/** A saved VM as a step of the route: its address and jumps come from the VM, edited in its own dialog. */
const ConnectionDialogVmHop = ({ hostId, index, count, onMove, onRemove }: ConnectionDialogVmHopProps) => {
  const t = useT();
  const hosts = useConnectionStore((s) => s.sshHosts);
  const openHostDialog = useConnectionStore((s) => s.openHostDialog);
  const host = hosts.find((h) => h.id === hostId);
  const jumps = host ? vmChain(hosts, host.id).slice(0, -1) : [];

  return (
    <li
      className="space-y-2 rounded-theme border-(length:--bw) border-line bg-surface-2 p-3"
      aria-label={t('connections.hopLabel', { number: index + 1, kind: t('connections.hop.vm') })}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold">
          {index + 1}. {host ? host.name : t('vms.missing')}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label={t('common.moveUp')} size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={15} />
          </IconButton>
          <IconButton label={t('common.moveDown')} size="sm" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown size={15} />
          </IconButton>
          <IconButton label={t('connections.removeHop')} size="sm" onClick={onRemove}>
            <X size={15} />
          </IconButton>
        </div>
      </div>
      {host && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-all text-muted">
            {host.user}@{vmLabel(host)}
            {jumps.length > 0 && ` ${t('vms.through', { names: jumps.map((j) => j.name).join(', ') })}`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => openHostDialog(host.id)}>
            {t('vms.edit')}
          </Button>
        </div>
      )}
    </li>
  );
};

export default ConnectionDialogVmHop;
