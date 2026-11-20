import type { ConnectionProfile, OracleRole } from '../../../domain/connections';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import ConnectionField from './connection-field';

type ConnectionDialogWalletProps = {
  draft: ConnectionProfile;
  secret: string;
  editing: boolean;
  error: string | null;
  onChange: (patch: Partial<ConnectionProfile>) => void;
  onSecret: (value: string) => void;
  onChoose: () => void;
};

/** The wallet of an Oracle connection (Autonomous Database or mTLS) with its password, and the privilege to connect with. */
const ConnectionDialogWallet = ({ draft, secret, editing, error, onChange, onSecret, onChoose }: ConnectionDialogWalletProps) => {
  const t = useT();
  const wallet = draft.wallet ?? '';

  return (
    <div className="space-y-3">
      <ConnectionField id="connection-wallet" label={t('connections.oracle.wallet')} error={error ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <input
            id="connection-wallet"
            className="field min-w-48 flex-1 font-sql"
            value={wallet}
            spellCheck={false}
            placeholder={t('connections.oracle.walletNone')}
            onChange={(e) => onChange({ wallet: e.target.value })}
          />
          <Button onClick={onChoose}>{t('connections.oracle.chooseWallet')}</Button>
          {wallet && (
            <Button variant="ghost" onClick={() => onChange({ wallet: undefined })}>
              {t('connections.oracle.removeWallet')}
            </Button>
          )}
        </div>
      </ConnectionField>
      <div className="grid gap-3 sm:grid-cols-2">
        {wallet && (
          <ConnectionField id="connection-wallet-password" label={t('connections.oracle.walletPassword')}>
            <input
              id="connection-wallet-password"
              className="field"
              type="password"
              autoComplete="off"
              value={secret}
              placeholder={editing ? t('connections.keepSecret') : ''}
              onChange={(e) => onSecret(e.target.value)}
            />
          </ConnectionField>
        )}
        <ConnectionField id="connection-oracle-role" label={t('connections.oracle.role')}>
          <select
            id="connection-oracle-role"
            className="field"
            value={draft.role ?? ''}
            onChange={(e) => onChange({ role: (e.target.value || undefined) as OracleRole | undefined })}
          >
            <option value="">{t('connections.oracle.roleNormal')}</option>
            <option value="sysdba">SYSDBA</option>
            <option value="sysoper">SYSOPER</option>
          </select>
        </ConnectionField>
      </div>
    </div>
  );
};

export default ConnectionDialogWallet;
