import { useMemo } from 'react';

const KEYWORDS =
  /\b(CREATE|TABLE|INDEX|UNIQUE|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|ALTER|ADD|NOT|NULL|DEFAULT|CHECK|ON|DELETE|UPDATE|CASCADE|RESTRICT|SET|NO|ACTION|USING|WHERE|GENERATED|BY|AS|IDENTITY|AUTO_INCREMENT|AUTOINCREMENT|PRAGMA|DESC|ASC|CLUSTERED|NONCLUSTERED|BITMAP)\b/g;

type Token = { text: string; kind: 'kw' | 'comment' | 'string' | 'plain' };

const tokenize = (line: string): Token[] => {
  if (line.trimStart().startsWith('--')) return [{ text: line, kind: 'comment' }];
  const tokens: Token[] = [];
  const parts = line.split(/('(?:[^']|'')*')/g);
  for (const part of parts) {
    if (part.startsWith("'") && part.endsWith("'") && part.length > 1) {
      tokens.push({ text: part, kind: 'string' });
      continue;
    }
    let last = 0;
    for (const match of part.matchAll(KEYWORDS)) {
      if (match.index! > last) tokens.push({ text: part.slice(last, match.index), kind: 'plain' });
      tokens.push({ text: match[0], kind: 'kw' });
      last = match.index! + match[0].length;
    }
    if (last < part.length) tokens.push({ text: part.slice(last), kind: 'plain' });
  }
  return tokens;
};

const kindClass = { kw: 'text-accent font-semibold', comment: 'text-muted italic', string: 'text-success', plain: '' };

const SqlPreviewCode = ({ sql }: { sql: string }) => {
  const lines = useMemo(() => sql.split('\n').map(tokenize), [sql]);

  return (
    <pre className="min-h-0 flex-1 overflow-auto p-4 font-sql text-[13px] leading-relaxed">
      <code>
        {lines.map((tokens, i) => (
          <div key={i}>
            {tokens.length === 0 ? ' ' : tokens.map((t, j) => <span key={j} className={kindClass[t.kind]}>{t.text}</span>)}
          </div>
        ))}
      </code>
    </pre>
  );
};

export default SqlPreviewCode;
