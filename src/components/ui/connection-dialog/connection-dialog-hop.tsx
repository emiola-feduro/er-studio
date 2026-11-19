import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { hopSecret, type HopProfile, type SshAuthMethod } from '../../../domain/connections';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import IconButton from '../icon-button/icon-button';
import ConnectionField from './connection-field';

type ConnectionDialogHopProps = {
  hop: HopProfile;
  index: number;
  count: number;
  secret: string;
  editing: boolean;
  problems: Record<string, string>;
  onChange: (hop: HopProfile) => void;
  onSecret: (value: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
};

const AUTH_METHODS: SshAuthMethod[] = ['password', 'key', 'agent'];

/** One hop of the route: SSH tunnel, SOCKS or HTTP proxy, with its own fields. */
const ConnectionDialogHop = ({ hop, index, count, secret, editing, problems, onChange, onSecret, onMove, onRemove }: ConnectionDialogHopProps) => {
  const t = useT();
  const id = (field: string) => `hop-${index}-${field}`;
  const secretKind = hopSecret(hop);

  return (
    <li
      className="space-y-3 rounded-theme border-(length:--bw) border-line bg-surface-2 p-3"
      aria-label={t('connections.hopLabel', { number: index + 1, kind: t(`connections.hop.${hop.kind}`) })}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {index + 1}. {t(`connections.hop.${hop.kind}`)}
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
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <ConnectionField id={id('host')} label={t('connections.host')} error={problems[`hop${index}.host`]}>
          <input id={id('host')} className="field" value={hop.host} onChange={(e) => onChange({ ...hop, host: e.target.value })} />
        </ConnectionField>
        <ConnectionField id={id('port')} label={t('connections.port')} error={problems[`hop${index}.port`]}>
          <input
            id={id('port')}
            className="field"
            type="number"
            min={1}
            max={65535}
            value={hop.port}
            onChange={(e) => onChange({ ...hop, port: Number(e.target.value) })}
          />
        </ConnectionField>
      </div>
      {hop.kind === 'ssh' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ConnectionField id={id('user')} label={t('connections.user')} error={problems[`hop${index}.user`]}>
            <input id={id('user')} className="field" value={hop.user} onChange={(e) => onChange({ ...hop, user: e.target.value })} />
          </ConnectionField>
          <ConnectionField id={id('auth')} label={t('connections.auth')}>
            <select id={id('auth')} className="field" value={hop.auth} onChange={(e) => onChange({ ...hop, auth: e.target.value as SshAuthMethod })}>
              {AUTH_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`connections.auth.${method}`)}
                </option>
              ))}
            </select>
          </ConnectionField>
          {hop.auth === 'key' && (
            <ConnectionField id={id('key')} label={t('connections.keyPath')} error={problems[`hop${index}.key`]} className="sm:col-span-2">
              <input
                id={id('key')}
                className="field font-sql"
                value={hop.privateKeyPath ?? ''}
                placeholder="~/.ssh/id_ed25519"
                spellCheck={false}
                onChange={(e) => onChange({ ...hop, privateKeyPath: e.target.value })}
              />
            </ConnectionField>
          )}
        </div>
      )}
      {(hop.kind === 'socks5' || hop.kind === 'httpConnect') && (
        <ConnectionField id={id('user')} label={t('connections.proxyUser')}>
          <input id={id('user')} className="field" value={hop.username ?? ''} onChange={(e) => onChange({ ...hop, username: e.target.value })} />
        </ConnectionField>
      )}
      {hop.kind === 'socks4' && (
        <ConnectionField id={id('user')} label={t('connections.userId')}>
          <input id={id('user')} className="field" value={hop.userId ?? ''} onChange={(e) => onChange({ ...hop, userId: e.target.value })} />
        </ConnectionField>
      )}
      {secretKind && (
        <ConnectionField
          id={id('secret')}
          label={t(secretKind === 'passphrase' ? 'connections.passphrase' : hop.kind === 'ssh' ? 'connections.password' : 'connections.proxyPassword')}
        >
          <input
            id={id('secret')}
            className="field"
            type="password"
            autoComplete="off"
            value={secret}
            placeholder={editing ? t('connections.keepSecret') : ''}
            onChange={(e) => onSecret(e.target.value)}
          />
        </ConnectionField>
      )}
      {hop.kind === 'ssh' && hop.hostKey && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-muted">{t('connections.hostKey')}</span>
            <code className="block truncate font-[inherit] font-sql text-[0.9em]">{hop.hostKey}</code>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...hop, hostKey: undefined })}>
            {t('connections.forgetHostKey')}
          </Button>
        </div>
      )}
    </li>
  );
};

export default ConnectionDialogHop;
