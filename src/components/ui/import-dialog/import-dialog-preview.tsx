import type { ImportResult } from '../../../domain/import';
import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { importSummary } from '../../../hooks/data/use-import-schema';

type ImportDialogPreviewProps = {
  preview: { result?: ImportResult; error?: string } | null;
};

const WARNING_KEYS: Record<string, MessageKey> = {
  skipped: 'import.warning.skipped',
  customType: 'import.warning.customType',
  check: 'import.warning.check',
  missingTable: 'import.warning.missingTable',
  junctionFk: 'import.warning.junctionFk',
};

/** What the import would create, and what it leaves out. */
const ImportDialogPreview = ({ preview }: ImportDialogPreviewProps) => {
  const t = useT();
  if (!preview) return <p className="text-muted">{t('import.empty')}</p>;
  const { result, error } = preview;
  if (error || !result) return <p role="alert" className="text-danger">{t('import.failed', { message: error ?? '' })}</p>;
  const { report } = result;
  if (report.tables === 0) return <p role="alert" className="text-danger">{t('import.nothing')}</p>;

  const warnings = report.warnings.map((warning) => {
    const colon = warning.indexOf(':');
    const key = WARNING_KEYS[warning.slice(0, colon)];
    const detail = warning.slice(colon + 1);
    return key ? t(key, { detail }) : warning;
  });

  return (
    <div className="space-y-2" aria-live="polite">
      <p data-testid="import-summary" className="font-medium">
        {importSummary(report)}
      </p>
      {warnings.length > 0 && (
        <div className="space-y-1">
          <span className="block text-muted">{t('import.notes')}</span>
          <ul className="max-h-36 list-disc space-y-0.5 overflow-y-auto pl-5 text-[0.92em]">
            {warnings.map((warning, index) => (
              <li key={index} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ImportDialogPreview;
