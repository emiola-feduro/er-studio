/** Splits SQL into tokens for highlighting: keywords, functions, strings, numbers and comments. */

export type SqlToken = { text: string; kind: 'kw' | 'fn' | 'comment' | 'string' | 'number' | 'plain' };

const KEYWORDS = new Set(
  `SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN INNER LEFT RIGHT FULL OUTER CROSS GROUP BY ORDER HAVING LIMIT OFFSET
   DISTINCT UNION ALL EXCEPT INTERSECT WITH CASE WHEN THEN ELSE END BETWEEN LIKE ILIKE REGEXP EXISTS ASC DESC TOP FETCH FIRST
   ROWS ONLY NEXT TRUE FALSE INTERVAL DATE TIMESTAMP
   CREATE TABLE INDEX UNIQUE PRIMARY KEY FOREIGN REFERENCES CONSTRAINT ALTER ADD DROP DEFAULT CHECK DELETE UPDATE INSERT INTO
   VALUES SET CASCADE RESTRICT NO ACTION USING GENERATED ALWAYS IDENTITY AUTO_INCREMENT AUTOINCREMENT PRAGMA CLUSTERED
   NONCLUSTERED BITMAP DATABASE USE IF RENAME TO COLUMN MODIFY`.split(/\s+/),
);

// Comments, strings, quoted names, numbers, words; anything else passes through as plain text.
const TOKEN = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?|`[^`]*`?|\[[^\]\n]*\]?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?/g;

export const tokenizeSql = (text: string): SqlToken[] => {
  const tokens: SqlToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index!;
    if (index > last) tokens.push({ text: text.slice(last, index), kind: 'plain' });
    const [whole, comment, string, quoted, number, word, call] = match;
    if (comment) tokens.push({ text: comment, kind: 'comment' });
    else if (string) tokens.push({ text: string, kind: 'string' });
    else if (quoted) tokens.push({ text: quoted, kind: 'plain' });
    else if (number) tokens.push({ text: number, kind: 'number' });
    else if (word) {
      const upper = word.toUpperCase();
      tokens.push({ text: word, kind: KEYWORDS.has(upper) ? 'kw' : call ? 'fn' : 'plain' });
      if (call) tokens.push({ text: call, kind: 'plain' });
    } else tokens.push({ text: whole, kind: 'plain' });
    last = index + whole.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), kind: 'plain' });
  return tokens;
};

export const TOKEN_CLASS: Record<SqlToken['kind'], string> = {
  kw: 'text-accent font-semibold',
  fn: 'text-fk',
  comment: 'text-muted italic',
  string: 'text-success',
  number: 'text-warning',
  plain: '',
};
