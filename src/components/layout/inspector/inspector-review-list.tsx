import type { Finding } from '../../../domain/design-review';
import type { MessageKey } from '../../../i18n';
import useT from '../../../hooks/ui/use-t';
import { applyReviewFix, dismissFinding, restoreFindings } from '../../../lib/actions';
import useUiStore from '../../../stores/use-ui-store';
import Button from '../../ui/button/button';
import Pill from '../../ui/pill/pill';

type InspectorReviewListProps = {
  findings: Finding[];
  dismissed: number;
  /** Show a link to the table of each finding (the model summary lists every table). */
  linkTables?: boolean;
};

/** "Una sola tabla" inside a sentence: "Usar una sola tabla". */
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1);

/** Design review findings with their quick fix and a way to ignore them. */
const InspectorReviewList = ({ findings, dismissed, linkTables = false }: InspectorReviewListProps) => {
  const t = useT();
  const select = useUiStore((s) => s.select);

  const message = ({ rule, params }: Finding) =>
    rule === 'noNaturalKey' && params.candidate ? t('review.noNaturalKeyCandidate', params) : t(`review.${rule}` as MessageKey, params);

  return (
    <div className="space-y-2">
      {findings.length === 0 && <p className="text-success">{t('review.none')}</p>}
      <ul className="space-y-2">
        {findings.map((finding) => {
          const { id, severity, fix, tableId, params } = finding;
          return (
            <li key={id} className="space-y-1.5 rounded-[calc(var(--radius)*0.75)] p-1.5 hover:bg-surface-2">
              <div className="flex items-start gap-2">
                <Pill tone={severity === 'warning' ? 'warning' : 'neutral'}>{severity === 'warning' ? t('review.warning') : t('review.info')}</Pill>
                <span className="flex-1 leading-snug">{message(finding)}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {linkTables && (
                  <Button size="sm" variant="ghost" onClick={() => select({ kind: 'entity', id: tableId })}>
                    {t('review.goTo', { table: String(params.table ?? params.tables ?? '').split(', ')[0] })}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => dismissFinding(id)}>
                  {t('review.dismiss')}
                </Button>
                {fix && (
                  <Button size="sm" onClick={() => applyReviewFix(fix)}>
                    {fix.kind === 'createIndex'
                      ? t('review.fix.createIndex')
                      : fix.kind === 'makeUnique'
                        ? t('review.fix.makeUnique', { column: String(params.candidate) })
                        : fix.kind === 'specMapping'
                          ? t('review.fix.specMapping', { mapping: lowerFirst(t(`spec.mapping.${fix.mapping}` as MessageKey)) })
                          : t('review.fix.specFromRelationship')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {dismissed > 0 && (
        <Button size="sm" variant="ghost" onClick={restoreFindings}>
          {t('review.restore', { count: dismissed })}
        </Button>
      )}
    </div>
  );
};

export default InspectorReviewList;
