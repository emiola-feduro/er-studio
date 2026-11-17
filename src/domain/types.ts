import type { Locale } from '../i18n';
export type DialectId = 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver' | 'oracle';

export type ReferentialAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export type Position = { x: number; y: number };

export type Attribute = {
  id: string;
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  pk: boolean;
  nullable: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  /** Allowed values when type is ENUM. */
  enumValues?: string[];
};

export type IndexColumn = { columnId: string; order: 'ASC' | 'DESC' };

export type TableIndex = {
  id: string;
  name: string;
  nameIsCustom: boolean;
  columns: IndexColumn[];
  unique: boolean;
  method?: string;
  where?: string;
};

export type JunctionConfig = {
  relationshipId: string;
  pkMode: 'composite' | 'surrogate';
  keepUniqueOnFks: boolean;
};

export type Entity = {
  id: string;
  name: string;
  kind: 'entity' | 'junction';
  nameIsCustom: boolean;
  attributes: Attribute[];
  indexes: TableIndex[];
  position: Position;
  color?: string;
  junction?: JunctionConfig;
};

export type Cardinality = '1' | 'N';

/** How a specialization becomes tables. */
export type SpecializationMapping = 'table-per-type' | 'single-table' | 'table-per-concrete';

/**
 * Generalization and specialization (EER): a supertype and its subtypes. Total means every
 * supertype row belongs to some subtype; disjoint means it belongs to at most one.
 */
export type Specialization = {
  id: string;
  name?: string;
  supertypeId: string;
  subtypeIds: string[];
  total: boolean;
  disjoint: boolean;
  mapping: SpecializationMapping;
  /** Column in the supertype that names the subtype of each row; only used when disjoint. */
  discriminator?: { name: string; values: Record<string, string> };
  /** Where the "d" or "o" circle sits on the diagram. */
  position?: Position;
};

export type Participant = {
  id: string;
  entityId: string;
  role?: string;
  cardinality: Cardinality;
  optional: boolean;
  constraintName?: string;
  /**
   * Attribute of this participant's entity that the FK points to, instead of its primary key.
   * Only used on the referenced side of a binary relationship; it must be UNIQUE.
   */
  refAttributeId?: string;
  /** FK column names to use instead of the generated ones, one per referenced column (set when importing a DDL). */
  fkColumnNames?: string[];
};

export type Relationship = {
  id: string;
  name?: string;
  participants: Participant[];
  identifying: boolean;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  junctionId?: string;
};

/** A data row entered by the user. Values are kept as typed text, keyed by physical column id. */
export type DataRow = { id: string; values: Record<string, string> };

export type Project = {
  id: string;
  name: string;
  dialect: DialectId;
  /** Database the DDL creates and switches to. Empty means the script runs on the current database. */
  databaseName?: string;
  /** Language the table names are written in; used to put them in singular for FK names. Spanish when absent. */
  namesLocale?: Locale;
  /** Design review findings the person chose to ignore, by finding id. */
  dismissedFindings?: string[];
  entities: Entity[];
  relationships: Relationship[];
  specializations?: Specialization[];
  /** Data rows per table id. Optional so projects saved before this feature keep loading. */
  records?: Record<string, DataRow[]>;
  createdAt: number;
  updatedAt: number;
};

export type ProjectMeta = Pick<Project, 'id' | 'name' | 'dialect' | 'createdAt' | 'updatedAt'> & {
  tableCount: number;
};

/* Physical schema derived from the conceptual model */

export type Column = {
  id: string;
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  enumValues?: string[];
  pk: boolean;
  origin: 'attribute' | 'fk';
  fkId?: string;
};

export type ForeignKey = {
  id: string;
  name: string;
  tableId: string;
  columnIds: string[];
  refTableId: string;
  refColumnIds: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  relationshipId: string;
  participantId: string;
  /** Crow's foot end markers: [at holder table, at referenced table] */
  holderEnd: EndMarker;
  refEnd: EndMarker;
};

export type EndMarker = 'one' | 'zeroOrOne' | 'many' | 'zeroOrMany';

export type UniqueConstraint = { name: string; columnIds: string[] };

export type Table = {
  id: string;
  name: string;
  kind: 'entity' | 'junction';
  arity?: number;
  columns: Column[];
  pk?: { name: string; columnIds: string[] };
  uniques: UniqueConstraint[];
  /** CHECK constraints on several columns, with the expression already written for the gestor. */
  checks?: { name: string; expression: string }[];
  foreignKeys: ForeignKey[];
  indexes: TableIndex[];
};

export type Schema = {
  tables: Table[];
  foreignKeys: ForeignKey[];
  issues: Issue[];
};

export type Issue = {
  level: 'error' | 'warning';
  message: string;
  entityId?: string;
  relationshipId?: string;
  specializationId?: string;
};

/** A saved copy of a project's model, to compare later and generate the migration between versions. */
export type ModelVersion = {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  /** The model without its data rows. */
  snapshot: Omit<Project, 'records'>;
};
