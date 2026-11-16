import { useMemo, useRef } from 'react';
import type useQueryRun from '../../../hooks/data/use-query-run';
import useColumnWidths, { type FitColumn } from '../../../hooks/ui/use-column-widths';
import useT from '../../../hooks/ui/use-t';
import { DIALECTS } from '../../../domain/dialects';
import type { DialectId } from '../../../domain/types';
import type { SqlValue } from '../../../domain/query-data';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../button/button';
import ColumnResizeHandle from '../column-resize-handle/column-resize-handle';

type QueryBuilderResultsProps = {
  runner: ReturnType<typeof useQueryRun>;
  dialect: DialectId;
  /** Where the column widths are kept (one set per project). */
  scope: string;
  /** Which query the rows came from: the generated one or the editor. */
  sourceLabel?: string;
};

const MAX_ROWS = 500;

const csvField = (value: SqlValue) => {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Rows returned by the last run, or the state that explains why there are none. */
const QueryBuilderResults = ({ runner, dialect, scope, sourceLabel }: QueryBuilderResultsProps) => {
  const t = useT();
  const { status, run, ranSql, stale, noRecords, readOnly } = runner;
  const tableRef = useRef<HTMLTableElement>(null);
  const ok = run && !('error' in run) ? run : undefined;
  const fitColumns = useMemo(
    (): FitColumn[] =>
      (ok?.columns ?? []).map((column, index) => ({
        key: column,
        header: [column],
        values: ok!.rows.slice(0, MAX_ROWS).map((row) => (row[index] === null ? 'NULL' : String(row[index]))),
      })),
    [ok],
  );
  const widths = useColumnWidths(scope, fitColumns, tableRef, { extra: 28, min: 56, max: 480 });

  const copyCsv = async () => {
    if (!run || 'error' in run) return;
    const { notify } = useUiStore.getState();
    const text = [run.columns, ...run.rows].map((row) => row.map(csvField).join(',')).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(t('query.csvCopied'));
    } catch {
      notify(t('sql.copyFailed'), 'error');
    }
  };

  const message = (text: string, tone = 'text-muted') => <p className={`p-4 ${tone}`}>{text}</p>;

  const body = () => {
    if (!readOnly) return message(t('query.notSelect'), 'text-warning');
    if (noRecords)
      return (
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-muted">{t('query.noRecords')}</span>
          <Button size="sm" onClick={() => useUiStore.getState().setView('records')}>
            {t('query.goToRecords')}
          </Button>
        </div>
      );
    if (status === 'loading' && !run) return message(t('query.loadingEngine'));
    if (!run) return message(t('query.notRun'));
    if ('error' in run)
      return (
        <div className="space-y-2 p-4">
          <p role="alert" className="font-canvas text-danger">
            {run.error}
          </p>
          {ranSql && (
            <details>
              <summary className="cursor-pointer text-muted">{t('query.ranSql')}</summary>
              <pre className="mt-1 overflow-x-auto font-sql text-[0.88em] whitespace-pre-wrap">
                <code className="font-[inherit]">{ranSql}</code>
              </pre>
            </details>
          )}
        </div>
      );
    if (run.rows.length === 0) return message(t('query.noRows'));
    const shown = run.rows.slice(0, MAX_ROWS);
    return (
      <table
        ref={tableRef}
        className="table-fixed border-separate border-spacing-0 font-canvas text-[0.88em]"
        style={{ width: run.columns.reduce((sum, column) => sum + widths.widthOf(column), 0) }}
      >
        <colgroup>
          {run.columns.map((column, index) => (
            <col key={index} style={{ width: widths.widthOf(column) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            {run.columns.map((column, index) => (
              <th key={index} scope="col" className="relative truncate border-b border-l border-line px-3 py-1.5 text-left font-semibold first:border-l-0" title={column}>
                {column}
                <ColumnResizeHandle column={column} width={widths.widthOf(column)} onResize={(w) => widths.resize(column, w)} onFit={() => widths.fit(column)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="odd:bg-surface-2/50">
              {row.map((value, c) => (
                <td
                  key={c}
                  title={value === null ? undefined : String(value)}
                  className={`truncate border-b border-l border-line/60 px-3 py-1 first:border-l-0 ${typeof value === 'number' ? 'text-right tabular-nums' : ''} ${value === null ? 'text-muted italic' : ''}`}
                >
                  {value === null ? 'NULL' : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const done = run && !('error' in run) && !noRecords ? run : undefined;

  return (
    <section aria-label={t('query.results')} className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <h3 className="font-semibold">{t('query.results')}</h3>
        {sourceLabel && run && <span className="text-muted">{sourceLabel}</span>}
        {done && (
          <span data-testid="query-row-count" className="text-muted">
            {t('query.rows', { count: done.rows.length, ms: done.ms < 1 ? '<1' : Math.round(done.ms) })}
            {done.rows.length > MAX_ROWS ? ` ${t('query.truncated', { shown: MAX_ROWS, count: done.rows.length })}` : ''}
          </span>
        )}
        {stale && <span className="text-warning">{t('query.stale')}</span>}
        <span className="ml-auto" />
        {done && done.rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void copyCsv()}>
            {t('query.copyCsv')}
          </Button>
        )}
      </div>
      {dialect !== 'sqlite' && <p className="px-4 pb-2 text-[0.88em] text-muted">{t('query.sqliteNote', { dialect: DIALECTS[dialect].name })}</p>}
      <div className={`relative min-h-0 flex-1 overflow-auto ${stale ? 'opacity-60' : ''}`}>{body()}</div>
    </section>
  );
};

export default QueryBuilderResults;
