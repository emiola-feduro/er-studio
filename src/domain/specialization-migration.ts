import { t } from '../i18n';
import { quoteIdent, quoteLiteral } from './dialects';
import { discriminatorAttrId, discriminatorOf, flagAttrId, specializationRelId } from './specialization';
import type { DataMoves } from './migration';
import type { DialectId, Project, Schema, Table } from './types';

/**
 * Statements that copy the rows of a specialization when it changes how it maps to tables, so the
 * migration keeps the data: subclass tables into the superclass table (table per type to single
 * table) and back. Columns are matched by id, which both mappings share. Other changes of mapping
 * get a comment asking to copy the rows by hand.
 */
export const specializationDataMoves = (from: Project, to: Project, fromSchema: Schema, toSchema: Schema, dialect: DialectId): DataMoves => {
  const q = (name: string) => quoteIdent(dialect, name);
  const [TRUE] = dialect === 'sqlserver' || dialect === 'oracle' ? ['1'] : ['TRUE'];
  const oldTables = new Map(fromSchema.tables.map((x) => [x.id, x]));
  const newTables = new Map(toSchema.tables.map((x) => [x.id, x]));
  const out: string[] = [];
  const sources = new Set<string>();

  for (const after of to.specializations ?? []) {
    const before = from.specializations?.find((s) => s.id === after.id);
    if (!before || before.mapping === after.mapping) continue;
    const superName = to.entities.find((e) => e.id === after.supertypeId)?.name ?? '';
    const pair = `${before.mapping}>${after.mapping}`;

    if (pair === 'table-per-type>single-table') {
      const target = newTables.get(after.supertypeId);
      if (!target) continue;
      const key = target.pk?.columnIds ?? [];
      for (const subId of before.subtypeIds) {
        const sub = oldTables.get(subId);
        const fk = sub?.foreignKeys.find((f) => f.relationshipId === specializationRelId(before.id, subId));
        if (!sub || !fk) continue;
        // Columns of the subclass that now live in the superclass table.
        const moved = sub.columns.filter((c) => !fk.columnIds.includes(c.id) && target.columns.some((x) => x.id === c.id));
        const flag = target.columns.find((c) => c.id === flagAttrId(after.id, subId));
        if (!moved.length && !flag) continue;
        const match = fk.columnIds.map((id, i) => `s.${q(sub.columns.find((c) => c.id === id)!.name)} = ${q(target.name)}.${q(target.columns.find((c) => c.id === key[i])?.name ?? '?')}`).join(' AND ');
        const assignments = [
          ...moved.map((c) => `${q(target.columns.find((x) => x.id === c.id)!.name)} = (SELECT s.${q(c.name)} FROM ${q(sub.name)} s WHERE ${match})`),
          ...(flag ? [`${q(flag.name)} = ${TRUE}`] : []),
        ];
        sources.add(sub.id);
        out.push(
          `${t('migration.copyRows', { from: sub.name, to: target.name })}\nUPDATE ${q(target.name)} SET\n  ${assignments.join(',\n  ')}\nWHERE EXISTS (SELECT 1 FROM ${q(sub.name)} s WHERE ${match});`,
        );
      }
      continue;
    }

    if (pair === 'single-table>table-per-type') {
      const source = oldTables.get(before.supertypeId);
      if (!source) continue;
      const key = source.pk?.columnIds ?? [];
      const { values } = discriminatorOf(before, from.entities, from.namesLocale);
      const disc = source.columns.find((c) => c.id === discriminatorAttrId(before.id));
      for (const subId of after.subtypeIds) {
        const sub: Table | undefined = newTables.get(subId);
        const fk = sub?.foreignKeys.find((f) => f.relationshipId === specializationRelId(after.id, subId));
        if (!sub || !fk) continue;
        const flag = source.columns.find((c) => c.id === flagAttrId(before.id, subId));
        const where = disc ? `${q(disc.name)} = ${quoteLiteral(values[subId])}` : flag ? `${q(flag.name)} = ${TRUE}` : '';
        if (!where) continue;
        const moved = sub.columns.filter((c) => !fk.columnIds.includes(c.id) && source.columns.some((x) => x.id === c.id));
        const targets = [...fk.columnIds.map((id) => sub.columns.find((c) => c.id === id)!.name), ...moved.map((c) => c.name)];
        const picks = [...key.map((id) => source.columns.find((c) => c.id === id)!.name), ...moved.map((c) => source.columns.find((x) => x.id === c.id)!.name)];
        sources.add(source.id);
        out.push(
          `${t('migration.copyRows', { from: source.name, to: sub.name })}\nINSERT INTO ${q(sub.name)} (${targets.map(q).join(', ')})\n  SELECT ${picks.map(q).join(', ')} FROM ${q(source.name)} WHERE ${where};`,
        );
      }
      continue;
    }

    out.push(t('migration.copyByHand', { supertype: superName }));
  }
  return { sql: out, sourceTableIds: [...sources] };
};
