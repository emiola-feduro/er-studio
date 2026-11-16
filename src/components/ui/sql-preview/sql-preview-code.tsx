import { useMemo } from 'react';
import { TOKEN_CLASS, tokenizeSql } from '../../../lib/sql-highlight';

const SqlPreviewCode = ({ sql }: { sql: string }) => {
  const lines = useMemo(() => sql.split('\n').map(tokenizeSql), [sql]);

  return (
    <pre className="relative min-h-0 flex-1 overflow-auto p-4 font-sql text-[13px] leading-relaxed">
      {/* Tailwind preflight gives <code> its own monospace font; inherit so the chosen SQL font applies. */}
      <code className="font-[inherit]">
        {lines.map((tokens, i) => (
          <div key={i}>
            {tokens.length === 0 ? ' ' : tokens.map((t, j) => <span key={j} className={TOKEN_CLASS[t.kind]}>{t.text}</span>)}
          </div>
        ))}
      </code>
    </pre>
  );
};

export default SqlPreviewCode;
