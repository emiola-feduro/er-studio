import { describe, expect, it } from 'vitest';
import { isReadOnlySelect, toSqlite } from './sql-translate';

describe('toSqlite', () => {
  it('rewrites PostgreSQL', () => {
    expect(toSqlite("SELECT * FROM c WHERE c.nombre ILIKE '%a%' AND c.creado >= CURRENT_DATE - INTERVAL '30 days'", 'postgresql')).toBe(
      "SELECT * FROM c WHERE c.nombre LIKE '%a%' AND c.creado >= date('now', '-30 days')",
    );
    expect(toSqlite("x.email ~ '^[a-z]+@' AND x.d >= DATE '2025-01-01' AND x.t < TIMESTAMP '2025-01-01 00:00:00'", 'postgresql')).toBe(
      "x.email REGEXP '^[a-z]+@' AND x.d >= '2025-01-01' AND x.t < '2025-01-01 00:00:00'",
    );
  });

  it('rewrites MySQL, SQL Server and Oracle', () => {
    expect(toSqlite('p.fecha >= CURDATE() - INTERVAL 30 DAY AND CHAR_LENGTH(p.n) > 3', 'mysql')).toBe("p.fecha >= date('now', '-30 days') AND LENGTH(p.n) > 3");
    expect(toSqlite('SELECT TOP (20)\n  a.id\nFROM a\nWHERE a.f >= DATEADD(day, -30, CAST(GETDATE() AS date)) AND LEN(a.n) > 2;\n', 'sqlserver')).toBe(
      "SELECT\n  a.id\nFROM a\nWHERE a.f >= date('now', '-30 days') AND LENGTH(a.n) > 2\nLIMIT 20;",
    );
    expect(toSqlite('SELECT DISTINCT TOP (5) a.id FROM a', 'sqlserver')).toBe('SELECT DISTINCT a.id FROM a\nLIMIT 5;');
    expect(toSqlite("SELECT a.id FROM a WHERE a.f >= TRUNC(SYSDATE) - 30 AND REGEXP_LIKE(a.c, '^[0-9]+$')\nFETCH FIRST 10 ROWS ONLY;", 'oracle')).toBe(
      "SELECT a.id FROM a WHERE a.f >= date('now', '-30 days') AND a.c REGEXP '^[0-9]+$'\nLIMIT 10;",
    );
  });

  it('leaves quoted strings and SQLite alone', () => {
    expect(toSqlite("x.n = 'ILIKE NOW()'", 'postgresql')).toBe("x.n = 'ILIKE NOW()'");
    expect(toSqlite('a ILIKE b', 'sqlite')).toBe('a ILIKE b');
  });
});

describe('isReadOnlySelect', () => {
  it('accepts one SELECT or WITH', () => {
    expect(isReadOnlySelect('SELECT 1;')).toBe(true);
    expect(isReadOnlySelect('-- count\nWITH t AS (SELECT 1) SELECT * FROM t')).toBe(true);
    expect(isReadOnlySelect("SELECT * FROM a WHERE a.n = 'x; DELETE'")).toBe(true);
  });

  it('rejects writes and several statements', () => {
    expect(isReadOnlySelect('DELETE FROM a')).toBe(false);
    expect(isReadOnlySelect('SELECT 1; DROP TABLE a')).toBe(false);
    expect(isReadOnlySelect('WITH t AS (SELECT 1) DELETE FROM a')).toBe(false);
    expect(isReadOnlySelect('')).toBe(false);
  });
});
