import type { DialectId } from '../types';

/**
 * Intermediate representation shared by the SQL and DBML readers: plain tables, columns and keys as
 * written in the source, before they become the conceptual model (entities and relationships).
 */

export type IrColumn = {
  name: string;
  /** Type as written, without parameters: VARCHAR, NUMERIC, TIMESTAMP WITH TIME ZONE... */
  type: string;
  /** Parameters inside the parentheses: ['255'], ['10', '2'] or ['MAX']. */
  params: string[];
  notNull: boolean;
  pk: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  enumValues?: string[];
};

export type IrForeignKey = {
  name?: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string;
  onUpdate?: string;
};

export type IrIndex = { name?: string; columns: { name: string; order: 'ASC' | 'DESC' }[]; unique: boolean; where?: string; method?: string };

export type IrTable = {
  name: string;
  columns: IrColumn[];
  pk?: { name?: string; columns: string[] };
  uniques: { name?: string; columns: string[] }[];
  checks: { name?: string; expression: string }[];
  foreignKeys: IrForeignKey[];
  indexes: IrIndex[];
};

/** A many-to-many link written directly (DBML "<>"), with no junction table in the source. */
export type IrManyToMany = { tableA: string; columnsA: string[]; tableB: string; columnsB: string[]; name?: string };

export type Ir = {
  tables: IrTable[];
  manyToMany: IrManyToMany[];
  /** Gestor named in the source (DBML database_type) or guessed from its syntax. */
  dialect?: DialectId;
  databaseName?: string;
  /** Statements or lines that were skipped, so the person knows what did not come in. */
  skipped: string[];
};

export const emptyIr = (): Ir => ({ tables: [], manyToMany: [], skipped: [] });

export const emptyTable = (name: string): IrTable => ({ name, columns: [], uniques: [], checks: [], foreignKeys: [], indexes: [] });

export const emptyColumn = (name: string, type: string, params: string[] = []): IrColumn => ({
  name,
  type,
  params,
  notNull: false,
  pk: false,
  unique: false,
  autoIncrement: false,
});

/** Last part of a qualified name (schema.table → table). */
export const baseName = (name: string) => name.split('.').pop() ?? name;
