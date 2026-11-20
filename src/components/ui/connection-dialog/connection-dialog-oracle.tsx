import { ORACLE_CONNECT_BY, type ConnectionProfile, type OracleConnectBy } from '../../../domain/connections';
import useT from '../../../hooks/ui/use-t';
import ConnectionField from './connection-field';

type ConnectionDialogOracleProps = {
  draft: ConnectionProfile;
  problems: Record<string, string>;
  aliases: string[];
  onChange: (patch: Partial<ConnectionProfile>) => void;
};

/** How an Oracle connection names its database: service, SID, or a connect string or wallet alias. */
const ConnectionDialogOracle = ({ draft, problems, aliases, onChange }: ConnectionDialogOracleProps) => {
  const t = useT();
  const connectBy = draft.oracleConnectBy ?? 'service';

  return (
    <div className="space-y-3">
      <ConnectionField id="connection-oracle-by" label={t('connections.oracle.connectBy')} className="sm:max-w-xs">
        <select
          id="connection-oracle-by"
          className="field"
          value={connectBy}
          onChange={(e) => onChange({ oracleConnectBy: e.target.value as OracleConnectBy })}
        >
          {ORACLE_CONNECT_BY.map((by) => (
            <option key={by} value={by}>
              {t(`connections.oracle.by.${by}`)}
            </option>
          ))}
        </select>
      </ConnectionField>
      {connectBy === 'connectString' && (
        <div className="space-y-3">
          {aliases.length > 0 && (
            <ConnectionField id="connection-oracle-alias" label={t('connections.oracle.alias')} className="sm:max-w-xs">
              <select
                id="connection-oracle-alias"
                className="field"
                value={aliases.includes(draft.connectString ?? '') ? draft.connectString : ''}
                onChange={(e) => onChange({ connectString: e.target.value })}
              >
                <option value="" disabled>
                  {t('connections.oracle.chooseAlias')}
                </option>
                {aliases.map((alias) => (
                  <option key={alias} value={alias}>
                    {alias}
                  </option>
                ))}
              </select>
            </ConnectionField>
          )}
          <ConnectionField id="connection-oracle-string" label={t('connections.oracle.connectString')} error={problems.connectString}>
            <textarea
              id="connection-oracle-string"
              className="field min-h-20 font-sql"
              spellCheck={false}
              value={draft.connectString ?? ''}
              placeholder="(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCLPDB1)))"
              onChange={(e) => onChange({ connectString: e.target.value })}
            />
          </ConnectionField>
        </div>
      )}
    </div>
  );
};

export default ConnectionDialogOracle;
