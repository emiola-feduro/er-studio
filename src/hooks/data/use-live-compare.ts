import { useEffect, useMemo, useRef, useState } from 'react';
import { ENGINE_DIALECT, type ConnectionProfile } from '../../domain/connections';
import { DIALECTS } from '../../domain/dialects';
import { importIr } from '../../domain/import';
import { sqliteToIr } from '../../domain/import/sqlite';
import { buildSchema } from '../../domain/inference';
import { diffSchemas, type Migration } from '../../domain/migration';
import { alignByName } from '../../domain/schema-align';
import type { Project, Schema } from '../../domain/types';
import { t } from '../../i18n';
import { closeSession, listSchemas, openSession, readSchema, runScript, sessionErrorMessage, type SchemaInfo } from '../../lib/connections';
import { loadSqlEngine } from '../../lib/sql-engine';
import useUiStore from '../../stores/use-ui-store';

type Status = 'idle' | 'reading' | 'ready' | 'failed' | 'applying';

/** Usual schema of each engine, chosen first when it exists. */
const USUAL_SCHEMA = { postgres: 'public', sqlserver: 'dbo', mysql: '', sqlite: 'main', oracle: '' } as const;

/**
 * Compares a live database with the open model: reads its schema, matches tables and columns by name,
 * and gives the migration that turns the database into the model. It can apply it in one transaction.
 */
const useLiveCompare = (project: Project | null | undefined, connection: ConnectionProfile | undefined) => {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [schema, setSchema] = useState('');
  const [live, setLive] = useState<Schema | null>(null);
  const session = useRef<number | null>(null);

  const release = () => {
    if (session.current !== null) void closeSession(session.current);
    session.current = null;
  };

  const sessionId = async () => {
    if (session.current !== null) return session.current;
    if (!connection) throw new Error(t('live.connectFailed'));
    const opened = await openSession(connection, connection.id);
    if (opened.sessionId === null) {
      const failure = opened.report.error;
      throw new Error(failure && 'message' in failure ? failure.message : t('live.connectFailed'));
    }
    session.current = opened.sessionId;
    return opened.sessionId;
  };

  const read = async (chosen: string) => {
    if (!connection) return;
    setStatus('reading');
    setError(null);
    try {
      let ir;
      if (connection.engine === 'sqlite') {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const SQL = await loadSqlEngine();
        const db = new SQL.Database(await readFile(connection.file ?? ''));
        try {
          ir = sqliteToIr((sql) => db.exec(sql)).ir;
        } finally {
          db.close();
        }
      } else {
        ir = (await readSchema(await sessionId(), [chosen])).ir;
      }
      const { project: liveProject } = importIr(ir, 'sql', {
        name: connection.name,
        dialect: ENGINE_DIALECT[connection.engine],
        namesLocale: project?.namesLocale,
      });
      setLive(buildSchema(liveProject));
      setStatus('ready');
    } catch (failure) {
      setError(sessionErrorMessage(failure));
      setStatus('failed');
    }
  };

  // A new connection: list its schemas, pick the usual one and read it.
  useEffect(() => {
    setLive(null);
    setSchemas([]);
    setError(null);
    if (!connection) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatus('reading');
      try {
        const found = connection.engine === 'sqlite' ? [{ name: 'main', tables: 0 }] : await listSchemas(await sessionId());
        if (cancelled) return;
        setSchemas(found);
        // Oracle keeps each user's tables in the schema named after it.
        const usual = USUAL_SCHEMA[connection.engine] || (connection.engine === 'oracle' ? connection.user.trim().toUpperCase() : connection.database);
        const first = found.find((s) => s.name === usual) ?? found.find((s) => s.tables > 0) ?? found[0];
        const chosen = first?.name ?? '';
        setSchema(chosen);
        await read(chosen);
      } catch (failure) {
        if (cancelled) return;
        setError(sessionErrorMessage(failure));
        setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [connection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const migration = useMemo((): Migration | null => {
    if (!project || !live || !connection) return null;
    const model = buildSchema(project);
    const result = diffSchemas(alignByName(live, model), model, project.dialect, { from: connection.name, to: t('versions.current') });
    const engineDialect = ENGINE_DIALECT[connection.engine];
    if (engineDialect !== project.dialect) {
      result.warnings.unshift(t('migration.dialectMismatch', { from: DIALECTS[engineDialect].name, to: DIALECTS[project.dialect].name }));
    }
    return result;
  }, [project, live, connection]);

  const dialectMismatch = Boolean(project && connection && ENGINE_DIALECT[connection.engine] !== project.dialect);

  const apply = async () => {
    if (!migration || migration.changes.length === 0) return;
    setStatus('applying');
    try {
      await runScript(await sessionId(), migration.sql);
      useUiStore.getState().notify(t('liveCompare.applied', { name: connection?.name ?? '' }));
      await read(schema);
    } catch (failure) {
      setError(sessionErrorMessage(failure));
      setStatus('failed');
    }
  };

  return {
    status,
    error,
    schemas,
    schema,
    chooseSchema: (name: string) => {
      setSchema(name);
      void read(name);
    },
    reread: () => void read(schema),
    migration,
    dialectMismatch,
    apply,
  };
};

export default useLiveCompare;
