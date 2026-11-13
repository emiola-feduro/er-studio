import type { Locale } from '../../i18n';
import { DIALECTS, findType, type TypeRef } from '../dialects';
import { buildSchema, defaultIndexName } from '../inference';
import { createAttribute, createProject, createRelationship, syncJunctions, uid } from '../model';
import { singularize } from '../naming';
import type { Attribute, DialectId, Entity, Participant, Project, ReferentialAction } from '../types';
import { baseName, type Ir, type IrColumn, type IrForeignKey, type IrTable } from './ir';

/** Turns the plain tables of a DDL or DBML into entities, relationships, junctions and indexes. */

/** Without namesLocale the language is guessed from the FK names; fallbackLocale breaks ties. */
export type ImportOptions = { name: string; dialect: DialectId; namesLocale?: Locale; fallbackLocale?: Locale };

const NAME_LOCALES: Locale[] = ['es', 'en', 'fr', 'pt'];

/**
 * Language of the table names: the one whose singular rule explains the most FK column names
 * (customers → customer_id is English, clientes → cliente_id is Spanish).
 */
export const detectNamesLocale = (ir: Ir, fallback: Locale = 'es'): Locale => {
  const score = (locale: Locale) =>
    ir.tables
      .flatMap((t) => t.foreignKeys)
      .filter((fk) => fk.columns.length === 1)
      .filter((fk) => lower(fk.columns[0]) === lower(`${singularize(baseName(fk.refTable), locale)}_${fk.refColumns[0] ?? 'id'}`)).length;
  const scores = NAME_LOCALES.map((locale) => ({ locale, value: score(locale) }));
  const best = Math.max(...scores.map((s) => s.value));
  if (best === 0 || scores.some((s) => s.locale === fallback && s.value === best)) return fallback;
  return scores.find((s) => s.value === best)!.locale;
};
export type ImportReport = { tables: number; relationships: number; indexes: number; warnings: string[] };

const lower = (s: string) => s.toLowerCase();

/** Type names written differently from the catalogs (PostgreSQL aliases, SQL standard spellings). */
const ALIASES: Record<string, string> = {
  INT4: 'INTEGER',
  INT8: 'BIGINT',
  INT2: 'SMALLINT',
  BOOL: 'BOOLEAN',
  'CHARACTER VARYING': 'VARCHAR',
  CHARACTER: 'CHAR',
  'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP',
  'TIME WITHOUT TIME ZONE': 'TIME',
  FLOAT8: 'DOUBLE PRECISION',
  FLOAT4: 'REAL',
  STRING: 'VARCHAR',
};

/** Generic family of a type name in any gestor, so types can be carried across gestores. */
const genericOf = (name: string) => {
  for (const dialect of Object.values(DIALECTS)) {
    const def = findType(dialect, name);
    if (def) return def;
  }
  return undefined;
};

type MappedType = Pick<Attribute, 'type' | 'length' | 'precision' | 'scale' | 'enumValues'> & { serial: boolean; custom: boolean };

export const mapType = (dialect: DialectId, column: IrColumn): MappedType => {
  if (column.enumValues?.length || column.type === 'ENUM') return { type: 'ENUM', enumValues: column.enumValues ?? [], serial: false, custom: false };
  const catalog = DIALECTS[dialect];
  const raw = column.type.toUpperCase();
  const isMax = column.params[0]?.toUpperCase() === 'MAX';
  const candidates = [isMax ? `${raw}(MAX)` : '', raw, ALIASES[raw] ?? '', raw === 'TIMESTAMP WITH TIME ZONE' && dialect === 'postgresql' ? 'TIMESTAMPTZ' : ''].filter(Boolean);
  let def = candidates.map((name) => findType(catalog, name)).find(Boolean);
  let ref: TypeRef | undefined;
  if (!def) {
    const foreign = candidates.map(genericOf).find(Boolean);
    if (foreign) {
      ref = catalog.map[foreign.generic];
      def = findType(catalog, ref.type);
    }
  }
  if (!def) {
    const params = column.params.length ? `(${column.params.join(',')})` : '';
    return { type: `${column.type}${params}`, serial: false, custom: true };
  }
  const numbers = column.params.map((p) => Number.parseInt(p, 10)).filter((n) => Number.isFinite(n));
  const mapped: MappedType = { type: def.name, serial: Boolean(def.serial), custom: false };
  if (def.params === 'length') mapped.length = isMax ? undefined : (numbers[0] ?? ref?.length ?? def.defaultLength);
  if (def.params === 'precisionScale') {
    mapped.precision = numbers[0] ?? ref?.precision;
    mapped.scale = numbers[1] ?? ref?.scale ?? (numbers[0] != null ? 0 : undefined);
  }
  return mapped;
};

/** "estado IN ('A', 'B')" as the list of values, when that is all the check says. */
const enumFromCheck = (expression: string, column: string) => {
  const match = new RegExp(`^\\(?\\s*["\`\\[]?${column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["\`\\]]?\\s+IN\\s*\\((.*)\\)\\s*\\)?$`, 'is').exec(expression.trim());
  if (!match) return undefined;
  const values = [...match[1].matchAll(/'((?:[^']|'')*)'\s*(,|$)/g)].map((m) => m[1].replace(/''/g, "'"));
  const rebuilt = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
  return values.length && match[1].replace(/\s+/g, ' ').trim() === rebuilt ? values : undefined;
};

const ACTIONS: ReferentialAction[] = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'];
const action = (value?: string): ReferentialAction => (ACTIONS.find((a) => a === value?.toUpperCase()) ?? 'NO ACTION');

export const irToProject = (ir: Ir, options: ImportOptions): { project: Project; report: ImportReport } => {
  const { dialect } = options;
  const project = createProject(options.name, dialect);
  if (ir.databaseName) project.databaseName = ir.databaseName;
  const warnings = [...ir.skipped.map((s) => `skipped:${s}`)];
  const byName = new Map(ir.tables.map((t) => [lower(t.name), t]));

  // FKs written with no referenced columns point to the primary key.
  for (const table of ir.tables) {
    for (const fk of table.foreignKeys) {
      if (fk.refColumns.length) continue;
      const ref = byName.get(lower(fk.refTable));
      fk.refColumns = ref ? pkColumns(ref) : ['id'];
    }
  }

  const namesLocale = options.namesLocale ?? detectNamesLocale(ir, options.fallbackLocale);
  project.namesLocale = namesLocale;

  // A junction: its primary key is made only of the columns of two or more FKs, and nothing else references it.
  const referenced = new Set(ir.tables.flatMap((t) => t.foreignKeys.map((fk) => lower(fk.refTable))));
  const junctionFks = new Map<IrTable, IrForeignKey[]>();
  for (const table of ir.tables) {
    const pk = pkColumns(table).map(lower);
    if (pk.length < 2 || referenced.has(lower(table.name))) continue;
    const keyFks = table.foreignKeys.filter((fk) => fk.columns.every((c) => pk.includes(lower(c))) && byName.has(lower(fk.refTable)));
    const covered = new Set(keyFks.flatMap((fk) => fk.columns.map(lower)));
    if (keyFks.length >= 2 && pk.every((c) => covered.has(c) || table.columns.find((col) => lower(col.name) === c))) {
      // Every key column must come from an FK, except extra columns that extend the key (a date, for example).
      if (pk.filter((c) => covered.has(c)).length >= 2) junctionFks.set(table, keyFks);
    }
  }

  const entities = new Map<string, Entity>();
  const attributeIds = new Map<string, Map<string, string>>(); // table → column name → attribute id

  const toAttribute = (table: IrTable, column: IrColumn, pkNames: string[]): Attribute => {
    const mapped = mapType(dialect, column);
    if (mapped.custom) warnings.push(`customType:${table.name}.${column.name}:${column.type}`);
    const isPk = pkNames.includes(lower(column.name));
    const tableCheck = table.checks.find((c) => enumFromCheck(c.expression, column.name));
    const enumValues = mapped.enumValues ?? enumFromCheck(column.check ?? '', column.name) ?? (tableCheck ? enumFromCheck(tableCheck.expression, column.name) : undefined);
    const uniqueAlone = table.uniques.some((u) => u.columns.length === 1 && lower(u.columns[0]) === lower(column.name));
    return createAttribute(dialect, {
      name: column.name,
      type: enumValues ? 'ENUM' : mapped.type,
      length: enumValues ? undefined : mapped.length,
      precision: mapped.precision,
      scale: mapped.scale,
      enumValues,
      pk: isPk,
      nullable: !(column.notNull || isPk),
      unique: (column.unique || uniqueAlone) && !isPk,
      autoIncrement: column.autoIncrement || mapped.serial,
      defaultValue: column.defaultValue,
      check: enumValues && enumFromCheck(column.check ?? '', column.name) ? undefined : column.check,
    });
  };

  // Entities with their own (non FK) columns. FK columns come back from the relationships.
  for (const table of ir.tables) {
    if (junctionFks.has(table)) continue;
    const fkColumns = new Set(table.foreignKeys.flatMap((fk) => fk.columns.map(lower)));
    const pkNames = pkColumns(table).map(lower);
    const entity: Entity = { id: uid(), name: table.name, kind: 'entity', nameIsCustom: true, attributes: [], indexes: [], position: { x: 0, y: 0 } };
    const ids = new Map<string, string>();
    for (const column of table.columns) {
      // A column that is both FK and the whole key of a 1:1 "subtype" table stays an FK too.
      if (fkColumns.has(lower(column.name))) continue;
      const attribute = toAttribute(table, column, pkNames);
      entity.attributes.push(attribute);
      ids.set(lower(column.name), attribute.id);
    }
    for (const check of table.checks) {
      if (table.columns.some((c) => enumFromCheck(check.expression, c.name))) continue;
      const target = entity.attributes.find((a) => new RegExp(`\\b${a.name}\\b`, 'i').test(check.expression));
      if (target && !target.check) target.check = check.expression;
      else warnings.push(`check:${table.name}:${check.expression}`);
    }
    entities.set(lower(table.name), entity);
    attributeIds.set(lower(table.name), ids);
    project.entities.push(entity);
  }

  /** Role and FK column names so the generated columns keep the names of the source. */
  const nameParticipant = (participant: Participant, fk: IrForeignKey, refTable: string) => {
    const prefix = singularize(refTable, namesLocale);
    const expected = fk.refColumns.map((c) => (lower(c).startsWith(`${lower(prefix)}_`) ? c : `${prefix}_${c}`));
    if (fk.columns.every((c, i) => lower(c) === lower(expected[i]))) return;
    // One column named "<role>_<refcolumn>": the role is enough.
    if (fk.columns.length === 1 && lower(fk.columns[0]).endsWith(`_${lower(fk.refColumns[0])}`)) {
      participant.role = fk.columns[0].slice(0, -(fk.refColumns[0].length + 1));
      return;
    }
    participant.fkColumnNames = [...fk.columns];
  };

  const refAttribute = (fk: IrForeignKey) => {
    const ref = byName.get(lower(fk.refTable));
    const isPk = ref && fk.refColumns.map(lower).join() === pkColumns(ref).map(lower).join();
    return isPk || fk.refColumns.length !== 1 ? undefined : attributeIds.get(lower(fk.refTable))?.get(lower(fk.refColumns[0]));
  };

  // Relationships from the plain FKs.
  for (const table of ir.tables) {
    if (junctionFks.has(table)) continue;
    const holder = entities.get(lower(table.name))!;
    for (const fk of table.foreignKeys) {
      const target = entities.get(lower(fk.refTable));
      if (!target) {
        warnings.push(`missingTable:${table.name}:${fk.refTable}`);
        continue;
      }
      const columns = fk.columns.map((c) => table.columns.find((col) => lower(col.name) === lower(c)));
      const unique =
        (fk.columns.length === 1 && (columns[0]?.unique || table.uniques.some((u) => u.columns.length === 1 && lower(u.columns[0]) === lower(fk.columns[0])))) ||
        table.uniques.some((u) => u.columns.map(lower).sort().join() === fk.columns.map(lower).sort().join());
      const rel = createRelationship([target.id, holder.id], unique ? '1:1' : '1:N');
      rel.onDelete = action(fk.onDelete);
      rel.onUpdate = action(fk.onUpdate);
      const pk = pkColumns(table).map(lower);
      rel.identifying = target.id !== holder.id && fk.columns.every((c) => pk.includes(lower(c)));
      const [parent, child] = rel.participants;
      parent.optional = columns.some((c) => c && !c.notNull && !c.pk);
      if (target.id === holder.id) {
        // Recursive: name the roles after the column ("jefe_id" → jefe) and the other side generically.
        parent.role = fk.columns[0].replace(/_(id|codigo|code)$/i, '') || 'padre';
        child.role = parent.role === 'hijo' ? 'subordinado' : 'hijo';
        if (!lower(fk.columns[0]).endsWith(`_${lower(fk.refColumns[0])}`) || fk.columns.length > 1) parent.fkColumnNames = [...fk.columns];
      } else nameParticipant(parent, fk, target.name);
      if (fk.name) parent.constraintName = fk.name;
      const refId = refAttribute(fk);
      if (refId) parent.refAttributeId = refId;
      project.relationships.push(rel);
    }
  }

  // Junction tables become many-to-many (or n-ary) relationships with their own attributes.
  const junctionAttributes: { relId: string; table: IrTable; extra: IrColumn[]; pkNames: string[] }[] = [];
  for (const [table, keyFks] of junctionFks) {
    const targets = keyFks.map((fk) => entities.get(lower(fk.refTable))).filter((e): e is Entity => Boolean(e));
    if (targets.length !== keyFks.length) continue;
    const rel = createRelationship(targets.map((e) => e.id), 'N:M');
    keyFks.forEach((fk, i) => {
      const participant = rel.participants[i];
      const recursive = targets.filter((e) => e.id === targets[i].id).length > 1;
      if (recursive) {
        participant.role = fk.columns[0].replace(/_(id|codigo|code)$/i, '');
        if (!lower(fk.columns[0]).endsWith(`_${lower(fk.refColumns[0])}`)) participant.fkColumnNames = [...fk.columns];
      } else nameParticipant(participant, fk, targets[i].name);
      if (fk.name) participant.constraintName = fk.name;
      rel.onDelete = action(fk.onDelete ?? rel.onDelete);
    });
    project.relationships.push(rel);
    const fkColumns = new Set(table.foreignKeys.flatMap((fk) => fk.columns.map(lower)));
    for (const fk of table.foreignKeys) if (!keyFks.includes(fk)) warnings.push(`junctionFk:${table.name}:${fk.columns.join(',')}`);
    junctionAttributes.push({ relId: rel.id, table, extra: table.columns.filter((c) => !fkColumns.has(lower(c.name))), pkNames: pkColumns(table).map(lower) });
  }

  // DBML "<>" links: many-to-many with a junction named as usual.
  for (const link of ir.manyToMany) {
    const a = entities.get(lower(link.tableA));
    const b = entities.get(lower(link.tableB));
    if (a && b) project.relationships.push(createRelationship([a.id, b.id], 'N:M'));
  }

  syncJunctions(project);
  for (const { relId, table, extra, pkNames } of junctionAttributes) {
    const junction = project.entities.find((e) => e.junction?.relationshipId === relId);
    if (!junction) continue;
    junction.name = table.name;
    junction.nameIsCustom = true;
    junction.attributes.push(...extra.map((column) => toAttribute(table, column, pkNames)));
    entities.set(lower(table.name), junction);
  }

  // Indexes and composite UNIQUE constraints, now that FK columns exist.
  const schema = buildSchema(project);
  let indexCount = 0;
  for (const table of ir.tables) {
    const entity = entities.get(lower(table.name));
    const built = schema.tables.find((t) => t.id === entity?.id);
    if (!entity || !built) continue;
    const columnId = (name: string) => built.columns.find((c) => lower(c.name) === lower(name))?.id;
    const add = (name: string | undefined, columns: { name: string; order: 'ASC' | 'DESC' }[], unique: boolean, where?: string, method?: string) => {
      const ids = columns.map((c) => ({ columnId: columnId(c.name), order: c.order }));
      if (ids.some((c) => !c.columnId)) return;
      const columnNames = columns.map((c) => c.name);
      const generated = defaultIndexName(table.name, columnNames);
      entity.indexes.push({
        id: uid(),
        name: name && name !== generated ? name : '',
        nameIsCustom: Boolean(name && name !== generated),
        unique,
        columns: ids as { columnId: string; order: 'ASC' | 'DESC' }[],
        ...(where ? { where } : {}),
        ...(method && DIALECTS[dialect].indexMethods.includes(method.toUpperCase()) ? { method: method.toUpperCase() } : method && DIALECTS[dialect].indexMethods.includes(method.toLowerCase()) ? { method: method.toLowerCase() } : {}),
      });
      indexCount += 1;
    };
    for (const index of table.indexes) add(index.name, index.columns, index.unique, index.where, index.method);
    // Composite UNIQUE constraints that the model does not already produce become unique indexes.
    for (const unique of table.uniques) {
      if (unique.columns.length < 2) continue;
      const covered = built.uniques.some((u) => u.columnIds.length === unique.columns.length && unique.columns.every((c) => u.columnIds.includes(columnId(c) ?? '')));
      if (!covered) add(unique.name, unique.columns.map((name) => ({ name, order: 'ASC' as const })), true);
    }
  }

  return { project, report: { tables: project.entities.length, relationships: project.relationships.length, indexes: indexCount, warnings } };
};

/** Primary key columns of a plain table: the PRIMARY KEY constraint or the columns marked as key. */
function pkColumns(table: IrTable) {
  return table.pk?.columns.length ? table.pk.columns : table.columns.filter((c) => c.pk).map((c) => c.name);
}
