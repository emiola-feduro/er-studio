import { describe, expect, it } from 'vitest';
import { statementInfo } from './sql-statement';

describe('statementInfo', () => {
  it('tells reads from writes', () => {
    for (const sql of [
      'SELECT 1',
      ' -- x\n select * from t',
      '/* DELETE */ SELECT 1',
      'WITH a AS (SELECT 1) SELECT * FROM a',
      'explain select 1',
      'SHOW TABLES',
      "SELECT 'DELETE FROM t'",
    ]) {
      expect(statementInfo(sql).readOnly, sql).toBe(true);
    }
    for (const sql of [
      'UPDATE t SET a = 1 WHERE id = 2',
      'INSERT INTO t VALUES (1)',
      'WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT 1)',
      'CREATE TABLE t (a int)',
      'PRAGMA journal_mode = WAL',
    ]) {
      expect(statementInfo(sql).readOnly, sql).toBe(false);
    }
  });

  it('flags the statements that touch a whole table or object', () => {
    expect(statementInfo('DELETE FROM "public"."cliente"').risk).toEqual({ kind: 'noWhere', verb: 'DELETE', target: 'cliente' });
    expect(statementInfo('update [dbo].[pedido] set total = 0').risk).toEqual({ kind: 'noWhere', verb: 'UPDATE', target: 'pedido' });
    expect(statementInfo('DELETE FROM cliente WHERE id = 1').risk).toBeUndefined();
    expect(statementInfo("UPDATE t SET a = 'WHERE'").risk).toEqual({ kind: 'noWhere', verb: 'UPDATE', target: 't' });
    expect(statementInfo('DROP TABLE IF EXISTS `ventas`').risk).toEqual({ kind: 'drop', object: 'TABLE', target: 'ventas' });
    expect(statementInfo('TRUNCATE TABLE logs').risk).toEqual({ kind: 'truncate', target: 'logs' });
    expect(statementInfo('ALTER TABLE cliente ADD x int').risk).toEqual({ kind: 'alter', target: 'cliente' });
    expect(statementInfo('SELECT 1; SELECT 2').multiple).toBe(true);
  });
});
