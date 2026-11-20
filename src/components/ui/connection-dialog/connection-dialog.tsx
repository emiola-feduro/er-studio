import { useRef, useState } from 'react';
import {
  ENGINES,
  ENVIRONMENTS,
  HOP_KINDS,
  ORACLE_TLS_MODES,
  TLS_MODES,
  usesConnectString,
  type ConnectionEngine,
  type ConnectionEnvironment,
  type HopKind,
  type TlsMode,
} from '../../../domain/connections';
import Checkbox from '../checkbox/checkbox';
import useConnectionDialog from '../../../hooks/data/use-connection-dialog';
import useT from '../../../hooks/ui/use-t';
import Button from '../button/button';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';
import Modal from '../modal/modal';
import ConnectionDialogHop from './connection-dialog-hop';
import ConnectionDialogOracle from './connection-dialog-oracle';
import ConnectionDialogReport from './connection-dialog-report';
import ConnectionDialogWallet from './connection-dialog-wallet';
import ConnectionField from './connection-field';

/** The file name of a path, for the default connection name. */
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? '';

/** New or edited database connection: server, TLS, the route of hops, test with diagnostics, and save. */
const ConnectionDialog = () => {
  const t = useT();
  const dialog = useConnectionDialog();
  const { draft, update, problems, secrets, editing } = dialog;
  const caRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [urlInvalid, setUrlInvalid] = useState(false);
  const [hopKind, setHopKind] = useState<HopKind>('ssh');
  const verifying = draft.tls.mode === 'verifyCa' || draft.tls.mode === 'verifyFull';
  const sqlite = draft.engine === 'sqlite';
  const oracle = draft.engine === 'oracle';
  const byString = usesConnectString(draft);
  // A wallet always means TLS.
  const walletTls = oracle && Boolean(draft.wallet?.trim());

  const applyUrl = () => {
    const ok = dialog.applyUrl(url);
    setUrlInvalid(!ok);
    if (ok) setUrl('');
  };

  return (
    <Modal
      title={t(editing ? 'connections.dialogEdit' : 'connections.dialogNew')}
      open={dialog.open}
      onClose={dialog.close}
      width="max-w-3xl"
      footer={
        <>
          {editing && (
            <Button variant="danger" className="mr-auto" onClick={() => dialog.setConfirmDelete(true)}>
              {t('connections.delete')}
            </Button>
          )}
          <Button onClick={dialog.close}>{t('common.cancel')}</Button>
          <Button disabled={dialog.testing} onClick={dialog.test}>
            {dialog.testing ? t('connections.testing') : t('connections.test')}
          </Button>
          <Button variant="primary" onClick={dialog.save}>
            {t('connections.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem_11rem]">
          <ConnectionField id="connection-name" label={t('connections.name')}>
            <input
              id="connection-name"
              className="field"
              value={draft.name}
              placeholder={sqlite ? fileName(draft.file ?? '') : t('connections.defaultName', { database: draft.database, host: draft.host })}
              onChange={(e) => update({ name: e.target.value })}
            />
          </ConnectionField>
          <ConnectionField id="connection-engine" label={t('connections.engine')}>
            <select id="connection-engine" className="field" value={draft.engine} onChange={(e) => dialog.setEngine(e.target.value as ConnectionEngine)}>
              {ENGINES.map((engine) => (
                <option key={engine} value={engine}>
                  {t(`connections.engine.${engine}`)}
                </option>
              ))}
            </select>
          </ConnectionField>
          <ConnectionField id="connection-environment" label={t('connections.environment')}>
            <select
              id="connection-environment"
              className="field"
              value={draft.environment}
              onChange={(e) => update({ environment: e.target.value as ConnectionEnvironment })}
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {t(`connections.env.${env}`)}
                </option>
              ))}
            </select>
          </ConnectionField>
        </div>
        <Checkbox label={t('connections.allowWrites')} checked={Boolean(draft.allowWrites)} onChange={(allowWrites) => update({ allowWrites })} />

        {sqlite && (
          <section className="space-y-3" aria-labelledby="connection-file-title">
            <h3 id="connection-file-title" className="font-semibold">
              {t('connections.file')}
            </h3>
            <ConnectionField id="connection-file" label={t('connections.filePath')} error={problems.file}>
              <div className="flex flex-wrap gap-2">
                <input
                  id="connection-file"
                  className="field min-w-48 flex-1 font-sql"
                  value={draft.file ?? ''}
                  spellCheck={false}
                  onChange={(e) => update({ file: e.target.value })}
                />
                <Button onClick={() => void dialog.chooseFile()}>{t('connections.chooseFile')}</Button>
              </div>
            </ConnectionField>
            <Checkbox label={t('connections.readOnlyFile')} checked={Boolean(draft.readOnlyFile)} onChange={(readOnlyFile) => update({ readOnlyFile })} />
          </section>
        )}

        {!sqlite && (
          <section className="space-y-3" aria-labelledby="connection-server-title">
            <h3 id="connection-server-title" className="font-semibold">
              {t('connections.server')}
            </h3>
            <ConnectionField id="connection-url" label={t('connections.url')} error={urlInvalid ? t('connections.urlInvalid') : undefined}>
              <div className="flex flex-wrap gap-2">
                <input
                  id="connection-url"
                  className="field min-w-48 flex-1 font-sql"
                  value={url}
                  spellCheck={false}
                  placeholder={oracle ? 'jdbc:oracle:thin:@//host:1521/ORCLPDB1' : t('connections.urlPlaceholder')}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlInvalid(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyUrl();
                  }}
                />
                <Button disabled={!url.trim()} onClick={applyUrl}>
                  {t('connections.applyUrl')}
                </Button>
              </div>
            </ConnectionField>
            {oracle && <ConnectionDialogOracle draft={draft} problems={problems} aliases={dialog.walletAliases} onChange={update} />}
            {!byString && (
              <div className={`grid gap-3 ${draft.engine === 'sqlserver' ? 'sm:grid-cols-[1fr_10rem_7rem]' : 'sm:grid-cols-[1fr_7rem]'}`}>
                <ConnectionField id="connection-host" label={t('connections.host')} error={problems.host}>
                  <input id="connection-host" className="field" value={draft.host} onChange={(e) => update({ host: e.target.value })} />
                </ConnectionField>
                {draft.engine === 'sqlserver' && (
                  <ConnectionField id="connection-instance" label={t('connections.instance')}>
                    <input
                      id="connection-instance"
                      className="field"
                      value={draft.instance ?? ''}
                      placeholder="SQLEXPRESS"
                      onChange={(e) => update({ instance: e.target.value })}
                    />
                  </ConnectionField>
                )}
                <ConnectionField id="connection-port" label={t('connections.port')} error={problems.port}>
                  <input
                    id="connection-port"
                    className="field"
                    type="number"
                    min={draft.engine === 'sqlserver' ? 0 : 1}
                    max={65535}
                    value={draft.port}
                    onChange={(e) => update({ port: Number(e.target.value) })}
                  />
                </ConnectionField>
              </div>
            )}
            <div className={`grid gap-3 ${byString ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {!byString && (
                <ConnectionField
                  id="connection-database"
                  label={oracle ? t(`connections.oracle.by.${draft.oracleConnectBy ?? 'service'}`) : t('connections.database')}
                  error={problems.database}
                >
                  <input
                    id="connection-database"
                    className="field"
                    value={draft.database}
                    placeholder={oracle ? 'ORCLPDB1' : undefined}
                    onChange={(e) => update({ database: e.target.value })}
                  />
                </ConnectionField>
              )}
              {!draft.integratedAuth && (
                <ConnectionField id="connection-user" label={t('connections.user')} error={problems.user}>
                  <input id="connection-user" className="field" value={draft.user} onChange={(e) => update({ user: e.target.value })} />
                </ConnectionField>
              )}
              {!draft.integratedAuth && (
                <ConnectionField id="connection-password" label={t('connections.password')}>
                  <input
                    id="connection-password"
                    className="field"
                    type="password"
                    autoComplete="off"
                    value={secrets.db}
                    placeholder={editing ? t('connections.keepSecret') : ''}
                    onChange={(e) => dialog.setDbSecret(e.target.value)}
                  />
                </ConnectionField>
              )}
            </div>
            {oracle && (
              <ConnectionDialogWallet
                draft={draft}
                secret={secrets.wallet ?? ''}
                editing={editing}
                error={dialog.walletError}
                onChange={update}
                onSecret={dialog.setWalletSecret}
                onChoose={() => void dialog.chooseWallet()}
              />
            )}
            {draft.engine === 'sqlserver' && (
              <Checkbox
                label={t('connections.integratedAuth')}
                checked={Boolean(draft.integratedAuth)}
                onChange={(integratedAuth) => update({ integratedAuth })}
              />
            )}
          </section>
        )}

        {!sqlite && (
          <>
            <section className="space-y-3" aria-labelledby="connection-tls-title">
              <h3 id="connection-tls-title" className="font-semibold">
                {t('connections.tls')}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <ConnectionField id="connection-tls-mode" label={t('connections.tlsMode')}>
                  <select
                    id="connection-tls-mode"
                    className="field"
                    value={walletTls ? 'verifyFull' : draft.tls.mode}
                    disabled={walletTls}
                    onChange={(e) => update({ tls: { ...draft.tls, mode: e.target.value as TlsMode } })}
                  >
                    {(oracle ? ORACLE_TLS_MODES : TLS_MODES).map((mode) => (
                      <option key={mode} value={mode}>
                        {t(oracle && mode === 'verifyFull' ? 'connections.tls.oracleTcps' : `connections.tls.${mode}`)}
                      </option>
                    ))}
                  </select>
                </ConnectionField>
                {verifying && !oracle && (
                  <ConnectionField id="connection-server-name" label={t('connections.serverName')}>
                    <input
                      id="connection-server-name"
                      className="field"
                      value={draft.tls.serverName ?? ''}
                      placeholder={draft.host}
                      onChange={(e) => update({ tls: { ...draft.tls, serverName: e.target.value } })}
                    />
                  </ConnectionField>
                )}
              </div>
              {verifying && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t('connections.caFile')}</span>
                  <span className="text-muted">{draft.tls.caPem ? t('connections.caLoaded') : t('connections.caSystem')}</span>
                  <Button size="sm" onClick={() => caRef.current?.click()}>
                    {t('connections.chooseCa')}
                  </Button>
                  {draft.tls.caPem && (
                    <Button size="sm" variant="ghost" onClick={() => update({ tls: { ...draft.tls, caPem: undefined } })}>
                      {t('connections.removeCa')}
                    </Button>
                  )}
                  <input
                    ref={caRef}
                    type="file"
                    accept=".pem,.crt,.cer"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) update({ tls: { ...draft.tls, caPem: await file.text() } });
                    }}
                  />
                </div>
              )}
            </section>

            <section className="space-y-3" aria-labelledby="connection-route-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="connection-route-title" className="font-semibold">
                  {t('connections.route')}
                </h3>
                <Button size="sm" variant="ghost" onClick={() => void dialog.loadSshConfig()}>
                  {t('connections.importSsh')}
                </Button>
              </div>
              {dialog.sshHosts &&
                (dialog.sshHosts.length === 0 ? (
                  <p className="text-muted">{t('connections.noSshConfig')}</p>
                ) : (
                  <ConnectionField id="connection-ssh-host" label={t('connections.sshHost')}>
                    <select id="connection-ssh-host" className="field" defaultValue="" onChange={(e) => e.target.value && dialog.importSshHost(e.target.value)}>
                      <option value="" disabled>
                        {t('connections.chooseSshHost')}
                      </option>
                      {dialog.sshHosts.map((host) => (
                        <option key={host.alias} value={host.alias}>
                          {host.alias === host.hostName ? host.alias : `${host.alias} (${host.hostName})`}
                        </option>
                      ))}
                    </select>
                  </ConnectionField>
                ))}
              {problems.oracleRoute && <p className="text-danger">{problems.oracleRoute}</p>}
              {draft.hops.length === 0 ? (
                <p className="text-muted">{t('connections.routeEmpty')}</p>
              ) : (
                <ol className="space-y-2">
                  {draft.hops.map((hop, index) => (
                    <ConnectionDialogHop
                      key={index}
                      hop={hop}
                      index={index}
                      count={draft.hops.length}
                      secret={secrets.hops[index] ?? ''}
                      editing={editing}
                      problems={problems}
                      onChange={(next) => dialog.updateHop(index, next)}
                      onSecret={(value) => dialog.setHopSecret(index, value)}
                      onMove={(by) => dialog.moveHop(index, by)}
                      onRemove={() => dialog.removeHop(index)}
                    />
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <ConnectionField id="connection-hop-kind" label={t('connections.hopKind')}>
                  <select id="connection-hop-kind" className="field" value={hopKind} onChange={(e) => setHopKind(e.target.value as HopKind)}>
                    {HOP_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`connections.hop.${kind}`)}
                      </option>
                    ))}
                  </select>
                </ConnectionField>
                <Button onClick={() => dialog.addHop(hopKind)}>{t('connections.addHop')}</Button>
              </div>
            </section>
          </>
        )}

        {dialog.report && <ConnectionDialogReport engine={draft.engine} report={dialog.report} onTrust={dialog.trustHostKey} />}
      </div>
      <ConfirmDialog
        open={dialog.confirmDelete}
        title={t('connections.deleteTitle')}
        message={t('connections.deleteMessage', { name: draft.name })}
        confirmLabel={t('connections.delete')}
        onConfirm={dialog.remove}
        onCancel={() => dialog.setConfirmDelete(false)}
      />
    </Modal>
  );
};

export default ConnectionDialog;
