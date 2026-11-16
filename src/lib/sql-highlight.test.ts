import { describe, expect, it } from 'vitest';
import { tokenizeSql } from './sql-highlight';

const kinds = (sql: string) => tokenizeSql(sql).filter((t) => t.kind !== 'plain').map((t) => `${t.kind}:${t.text}`);

describe('tokenizeSql', () => {
  it('finds keywords, functions, strings, numbers and comments', () => {
    expect(kinds("SELECT COUNT(*) FROM cliente c -- total\nWHERE c.nombre LIKE 'a%' AND c.id > 10")).toEqual([
      'kw:SELECT', 'fn:COUNT', 'kw:FROM', 'comment:-- total', 'kw:WHERE', 'kw:LIKE', "string:'a%'", 'kw:AND', 'number:10',
    ]);
  });

  it('keeps the text intact, even unfinished strings', () => {
    const sql = "select 'abc\nfrom x /* note";
    expect(tokenizeSql(sql).map((t) => t.text).join('')).toBe(sql);
    expect(kinds('"select" [from]')).toEqual([]);
  });
});
