import type { Attribute, DialectId } from './types';

export type Generic =
  | 'tinyint' | 'smallint' | 'int' | 'bigint' | 'serial' | 'bigserial'
  | 'decimal' | 'real' | 'double' | 'money' | 'bool'
  | 'char' | 'varchar' | 'nchar' | 'nvarchar' | 'text' | 'ntext'
  | 'date' | 'time' | 'datetime' | 'timestamptz' | 'interval' | 'year'
  | 'uuid' | 'json' | 'binary' | 'varbinary' | 'blob' | 'xml' | 'inet'
  | 'enum';

export type ParamKind = 'none' | 'length' | 'precisionScale' | 'values';

export type TypeDef = {
  name: string;
  generic: Generic;
  params: ParamKind;
  defaultLength?: number;
  defaultPrecision?: number;
  defaultScale?: number;
  /** Integer-like types that accept auto increment */
  integer?: boolean;
  /** Types that are auto incremented by definition (PostgreSQL SERIAL) */
  serial?: boolean;
  group: string;
};

export type TypeRef = { type: string; length?: number; precision?: number; scale?: number };

export const ENUM_TYPE = 'ENUM';

const ENUM_DEF: TypeDef = { name: ENUM_TYPE, generic: 'enum', params: 'values', group: 'Texto' };

export type Dialect = {
  id: DialectId;
  name: string;
  types: TypeDef[];
  /** Canonical type for each generic. Covers every generic. */
  map: Record<Generic, TypeRef>;
  quote: (name: string) => string;
  indexMethods: string[];
  supportsPartialIndex: boolean;
  supportsIndexOrder: boolean;
  supportsAlterAddFk: boolean;
  supportsOnUpdate: boolean;
  referentialActions: string[];
  defaultPk: TypeRef;
  defaultText: TypeRef;
};

const t = (
  name: string,
  generic: Generic,
  group: string,
  extra: Partial<TypeDef> = {},
): TypeDef => ({ name, generic, params: 'none', group, ...extra });

const len = (n: number) => ({ params: 'length' as const, defaultLength: n });
const ps = (p: number, s: number) => ({
  params: 'precisionScale' as const,
  defaultPrecision: p,
  defaultScale: s,
});

const NUM = 'Numéricos';
const TXT = 'Texto';
const DT = 'Fecha y hora';
const BIN = 'Binarios';
const OTHER = 'Otros';

const postgresql: Dialect = {
  id: 'postgresql',
  name: 'PostgreSQL',
  types: [
    t('SMALLINT', 'smallint', NUM, { integer: true }),
    t('INTEGER', 'int', NUM, { integer: true }),
    t('BIGINT', 'bigint', NUM, { integer: true }),
    t('SMALLSERIAL', 'serial', NUM, { serial: true }),
    t('SERIAL', 'serial', NUM, { serial: true }),
    t('BIGSERIAL', 'bigserial', NUM, { serial: true }),
    t('NUMERIC', 'decimal', NUM, ps(10, 2)),
    t('REAL', 'real', NUM),
    t('DOUBLE PRECISION', 'double', NUM),
    t('MONEY', 'money', NUM),
    t('BOOLEAN', 'bool', OTHER),
    t('CHAR', 'char', TXT, len(1)),
    t('VARCHAR', 'varchar', TXT, len(255)),
    t('TEXT', 'text', TXT),
    t('DATE', 'date', DT),
    t('TIME', 'time', DT),
    t('TIMESTAMP', 'datetime', DT),
    t('TIMESTAMPTZ', 'timestamptz', DT),
    t('INTERVAL', 'interval', DT),
    t('UUID', 'uuid', OTHER),
    t('JSON', 'json', OTHER),
    t('JSONB', 'json', OTHER),
    t('XML', 'xml', OTHER),
    t('INET', 'inet', OTHER),
    t('BYTEA', 'blob', BIN),
    ENUM_DEF,
  ],
  map: {
    tinyint: { type: 'SMALLINT' }, smallint: { type: 'SMALLINT' }, int: { type: 'INTEGER' },
    bigint: { type: 'BIGINT' }, serial: { type: 'SERIAL' }, bigserial: { type: 'BIGSERIAL' },
    decimal: { type: 'NUMERIC' }, real: { type: 'REAL' }, double: { type: 'DOUBLE PRECISION' },
    money: { type: 'MONEY' }, bool: { type: 'BOOLEAN' }, char: { type: 'CHAR' },
    varchar: { type: 'VARCHAR' }, nchar: { type: 'CHAR' }, nvarchar: { type: 'VARCHAR' },
    text: { type: 'TEXT' }, ntext: { type: 'TEXT' }, date: { type: 'DATE' }, time: { type: 'TIME' },
    datetime: { type: 'TIMESTAMP' }, timestamptz: { type: 'TIMESTAMPTZ' },
    interval: { type: 'INTERVAL' }, year: { type: 'SMALLINT' }, uuid: { type: 'UUID' },
    json: { type: 'JSONB' }, binary: { type: 'BYTEA' }, varbinary: { type: 'BYTEA' },
    blob: { type: 'BYTEA' }, xml: { type: 'XML' }, inet: { type: 'INET' },
    enum: { type: ENUM_TYPE },
  },
  quote: (n) => `"${n.replace(/"/g, '""')}"`,
  indexMethods: ['btree', 'hash', 'gin', 'gist', 'brin', 'spgist'],
  supportsPartialIndex: true,
  supportsIndexOrder: true,
  supportsAlterAddFk: true,
  supportsOnUpdate: true,
  referentialActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
  defaultPk: { type: 'INTEGER' },
  defaultText: { type: 'VARCHAR', length: 255 },
};

const mysql: Dialect = {
  id: 'mysql',
  name: 'MySQL / MariaDB',
  types: [
    t('TINYINT', 'tinyint', NUM, { integer: true }),
    t('SMALLINT', 'smallint', NUM, { integer: true }),
    t('MEDIUMINT', 'int', NUM, { integer: true }),
    t('INT', 'int', NUM, { integer: true }),
    t('BIGINT', 'bigint', NUM, { integer: true }),
    t('DECIMAL', 'decimal', NUM, ps(10, 2)),
    t('FLOAT', 'real', NUM),
    t('DOUBLE', 'double', NUM),
    t('BOOLEAN', 'bool', OTHER),
    t('CHAR', 'char', TXT, len(1)),
    t('VARCHAR', 'varchar', TXT, len(255)),
    t('TINYTEXT', 'text', TXT),
    t('TEXT', 'text', TXT),
    t('MEDIUMTEXT', 'text', TXT),
    t('LONGTEXT', 'text', TXT),
    t('DATE', 'date', DT),
    t('TIME', 'time', DT),
    t('DATETIME', 'datetime', DT),
    t('TIMESTAMP', 'timestamptz', DT),
    t('YEAR', 'year', DT),
    t('BINARY', 'binary', BIN, len(16)),
    t('VARBINARY', 'varbinary', BIN, len(255)),
    t('BLOB', 'blob', BIN),
    t('LONGBLOB', 'blob', BIN),
    t('JSON', 'json', OTHER),
    ENUM_DEF,
  ],
  map: {
    tinyint: { type: 'TINYINT' }, smallint: { type: 'SMALLINT' }, int: { type: 'INT' },
    bigint: { type: 'BIGINT' }, serial: { type: 'INT' }, bigserial: { type: 'BIGINT' },
    decimal: { type: 'DECIMAL' }, real: { type: 'FLOAT' }, double: { type: 'DOUBLE' },
    money: { type: 'DECIMAL', precision: 19, scale: 4 }, bool: { type: 'BOOLEAN' },
    char: { type: 'CHAR' }, varchar: { type: 'VARCHAR' }, nchar: { type: 'CHAR' },
    nvarchar: { type: 'VARCHAR' }, text: { type: 'TEXT' }, ntext: { type: 'TEXT' },
    date: { type: 'DATE' }, time: { type: 'TIME' }, datetime: { type: 'DATETIME' },
    timestamptz: { type: 'TIMESTAMP' }, interval: { type: 'VARCHAR', length: 64 },
    year: { type: 'YEAR' }, uuid: { type: 'CHAR', length: 36 }, json: { type: 'JSON' },
    binary: { type: 'BINARY' }, varbinary: { type: 'VARBINARY' }, blob: { type: 'BLOB' },
    xml: { type: 'LONGTEXT' }, inet: { type: 'VARCHAR', length: 45 },
    enum: { type: ENUM_TYPE },
  },
  quote: (n) => `\`${n.replace(/`/g, '``')}\``,
  indexMethods: ['BTREE', 'HASH'],
  supportsPartialIndex: false,
  supportsIndexOrder: true,
  supportsAlterAddFk: true,
  supportsOnUpdate: true,
  referentialActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'],
  defaultPk: { type: 'INT' },
  defaultText: { type: 'VARCHAR', length: 255 },
};

const sqlite: Dialect = {
  id: 'sqlite',
  name: 'SQLite',
  types: [
    t('INTEGER', 'int', NUM, { integer: true }),
    t('REAL', 'double', NUM),
    t('NUMERIC', 'decimal', NUM),
    t('BOOLEAN', 'bool', OTHER),
    t('TEXT', 'text', TXT),
    t('VARCHAR', 'varchar', TXT, len(255)),
    t('DATE', 'date', DT),
    t('DATETIME', 'datetime', DT),
    t('BLOB', 'blob', BIN),
    ENUM_DEF,
  ],
  map: {
    tinyint: { type: 'INTEGER' }, smallint: { type: 'INTEGER' }, int: { type: 'INTEGER' },
    bigint: { type: 'INTEGER' }, serial: { type: 'INTEGER' }, bigserial: { type: 'INTEGER' },
    decimal: { type: 'NUMERIC' }, real: { type: 'REAL' }, double: { type: 'REAL' },
    money: { type: 'NUMERIC' }, bool: { type: 'BOOLEAN' }, char: { type: 'TEXT' },
    varchar: { type: 'VARCHAR' }, nchar: { type: 'TEXT' }, nvarchar: { type: 'VARCHAR' },
    text: { type: 'TEXT' }, ntext: { type: 'TEXT' }, date: { type: 'DATE' }, time: { type: 'TEXT' },
    datetime: { type: 'DATETIME' }, timestamptz: { type: 'DATETIME' }, interval: { type: 'TEXT' },
    year: { type: 'INTEGER' }, uuid: { type: 'TEXT' }, json: { type: 'TEXT' }, binary: { type: 'BLOB' },
    varbinary: { type: 'BLOB' }, blob: { type: 'BLOB' }, xml: { type: 'TEXT' }, inet: { type: 'TEXT' },
    enum: { type: ENUM_TYPE },
  },
  quote: (n) => `"${n.replace(/"/g, '""')}"`,
  indexMethods: [],
  supportsPartialIndex: true,
  supportsIndexOrder: true,
  supportsAlterAddFk: false,
  supportsOnUpdate: true,
  referentialActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
  defaultPk: { type: 'INTEGER' },
  defaultText: { type: 'TEXT' },
};

const sqlserver: Dialect = {
  id: 'sqlserver',
  name: 'SQL Server',
  types: [
    t('TINYINT', 'tinyint', NUM, { integer: true }),
    t('SMALLINT', 'smallint', NUM, { integer: true }),
    t('INT', 'int', NUM, { integer: true }),
    t('BIGINT', 'bigint', NUM, { integer: true }),
    t('DECIMAL', 'decimal', NUM, ps(18, 2)),
    t('MONEY', 'money', NUM),
    t('REAL', 'real', NUM),
    t('FLOAT', 'double', NUM),
    t('BIT', 'bool', OTHER),
    t('CHAR', 'char', TXT, len(1)),
    t('VARCHAR', 'varchar', TXT, len(255)),
    t('NCHAR', 'nchar', TXT, len(1)),
    t('NVARCHAR', 'nvarchar', TXT, len(255)),
    t('VARCHAR(MAX)', 'text', TXT),
    t('NVARCHAR(MAX)', 'ntext', TXT),
    t('DATE', 'date', DT),
    t('TIME', 'time', DT),
    t('DATETIME2', 'datetime', DT),
    t('DATETIMEOFFSET', 'timestamptz', DT),
    t('UNIQUEIDENTIFIER', 'uuid', OTHER),
    t('XML', 'xml', OTHER),
    t('BINARY', 'binary', BIN, len(16)),
    t('VARBINARY', 'varbinary', BIN, len(255)),
    t('VARBINARY(MAX)', 'blob', BIN),
    ENUM_DEF,
  ],
  map: {
    tinyint: { type: 'TINYINT' }, smallint: { type: 'SMALLINT' }, int: { type: 'INT' },
    bigint: { type: 'BIGINT' }, serial: { type: 'INT' }, bigserial: { type: 'BIGINT' },
    decimal: { type: 'DECIMAL' }, real: { type: 'REAL' }, double: { type: 'FLOAT' },
    money: { type: 'MONEY' }, bool: { type: 'BIT' }, char: { type: 'CHAR' },
    varchar: { type: 'VARCHAR' }, nchar: { type: 'NCHAR' }, nvarchar: { type: 'NVARCHAR' },
    text: { type: 'NVARCHAR(MAX)' }, ntext: { type: 'NVARCHAR(MAX)' }, date: { type: 'DATE' },
    time: { type: 'TIME' }, datetime: { type: 'DATETIME2' }, timestamptz: { type: 'DATETIMEOFFSET' },
    interval: { type: 'VARCHAR', length: 64 }, year: { type: 'SMALLINT' },
    uuid: { type: 'UNIQUEIDENTIFIER' }, json: { type: 'NVARCHAR(MAX)' }, binary: { type: 'BINARY' },
    varbinary: { type: 'VARBINARY' }, blob: { type: 'VARBINARY(MAX)' }, xml: { type: 'XML' },
    inet: { type: 'VARCHAR', length: 45 },
    enum: { type: ENUM_TYPE },
  },
  quote: (n) => `[${n.replace(/]/g, ']]')}]`,
  indexMethods: ['NONCLUSTERED', 'CLUSTERED'],
  supportsPartialIndex: true,
  supportsIndexOrder: true,
  supportsAlterAddFk: true,
  supportsOnUpdate: true,
  referentialActions: ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
  defaultPk: { type: 'INT' },
  defaultText: { type: 'NVARCHAR', length: 255 },
};

const oracle: Dialect = {
  id: 'oracle',
  name: 'Oracle',
  types: [
    t('SMALLINT', 'smallint', NUM, { integer: true }),
    t('INTEGER', 'int', NUM, { integer: true }),
    t('NUMBER', 'decimal', NUM, ps(10, 2)),
    t('BINARY_FLOAT', 'real', NUM),
    t('BINARY_DOUBLE', 'double', NUM),
    t('BOOLEAN', 'bool', OTHER),
    t('CHAR', 'char', TXT, len(1)),
    t('VARCHAR2', 'varchar', TXT, len(255)),
    t('NCHAR', 'nchar', TXT, len(1)),
    t('NVARCHAR2', 'nvarchar', TXT, len(255)),
    t('CLOB', 'text', TXT),
    t('NCLOB', 'ntext', TXT),
    t('DATE', 'date', DT),
    t('TIMESTAMP', 'datetime', DT),
    t('TIMESTAMP WITH TIME ZONE', 'timestamptz', DT),
    t('INTERVAL DAY TO SECOND', 'interval', DT),
    t('RAW', 'varbinary', BIN, len(16)),
    t('BLOB', 'blob', BIN),
    t('JSON', 'json', OTHER),
    t('XMLTYPE', 'xml', OTHER),
    ENUM_DEF,
  ],
  map: {
    tinyint: { type: 'SMALLINT' }, smallint: { type: 'SMALLINT' }, int: { type: 'INTEGER' },
    bigint: { type: 'NUMBER', precision: 19, scale: 0 }, serial: { type: 'INTEGER' },
    bigserial: { type: 'NUMBER', precision: 19, scale: 0 }, decimal: { type: 'NUMBER' },
    real: { type: 'BINARY_FLOAT' }, double: { type: 'BINARY_DOUBLE' },
    money: { type: 'NUMBER', precision: 19, scale: 4 }, bool: { type: 'NUMBER', precision: 1, scale: 0 },
    char: { type: 'CHAR' }, varchar: { type: 'VARCHAR2' }, nchar: { type: 'NCHAR' },
    nvarchar: { type: 'NVARCHAR2' }, text: { type: 'CLOB' }, ntext: { type: 'NCLOB' },
    date: { type: 'DATE' }, time: { type: 'VARCHAR2', length: 16 }, datetime: { type: 'TIMESTAMP' },
    timestamptz: { type: 'TIMESTAMP WITH TIME ZONE' }, interval: { type: 'INTERVAL DAY TO SECOND' },
    year: { type: 'NUMBER', precision: 4, scale: 0 }, uuid: { type: 'RAW', length: 16 },
    json: { type: 'JSON' }, binary: { type: 'RAW' }, varbinary: { type: 'RAW' }, blob: { type: 'BLOB' },
    xml: { type: 'XMLTYPE' }, inet: { type: 'VARCHAR2', length: 45 },
    enum: { type: ENUM_TYPE },
  },
  quote: (n) => `"${n.replace(/"/g, '""')}"`,
  indexMethods: ['BITMAP'],
  supportsPartialIndex: false,
  supportsIndexOrder: true,
  supportsAlterAddFk: true,
  supportsOnUpdate: false,
  referentialActions: ['NO ACTION', 'CASCADE', 'SET NULL'],
  defaultPk: { type: 'INTEGER' },
  defaultText: { type: 'VARCHAR2', length: 255 },
};

export const DIALECTS: Record<DialectId, Dialect> = { postgresql, mysql, sqlite, sqlserver, oracle };

export const DIALECT_LIST = Object.values(DIALECTS);

export const findType = (dialect: Dialect, name: string) =>
  dialect.types.find((type) => type.name.toUpperCase() === name.toUpperCase());

/** Formats a type with its parameters, e.g. VARCHAR(255) or NUMERIC(10,2). */
export const formatType = (
  dialectId: DialectId,
  col: Pick<Attribute, 'type' | 'length' | 'precision' | 'scale'>,
): string => {
  const def = findType(DIALECTS[dialectId], col.type);
  const params = def?.params;
  if (params === 'length' || (!def && col.length != null)) {
    const value = col.length ?? def?.defaultLength;
    return value != null ? `${col.type}(${value})` : col.type;
  }
  if (params === 'precisionScale' || (!def && col.precision != null)) {
    const p = col.precision ?? def?.defaultPrecision;
    const s = col.scale ?? def?.defaultScale;
    if (p == null) return col.type;
    return s != null ? `${col.type}(${p},${s})` : `${col.type}(${p})`;
  }
  return col.type;
};

type TypedValue = Pick<Attribute, 'type' | 'length' | 'precision' | 'scale' | 'enumValues'>;

/**
 * Converts a type from one dialect to another through its generic category.
 * Returns null when the type is unknown in the source dialect (custom types are kept as written).
 */
export const convertType = (
  from: DialectId,
  to: DialectId,
  value: TypedValue,
): TypedValue | null => {
  if (from === to) return value;
  const sourceDef = findType(DIALECTS[from], value.type);
  if (!sourceDef) return null;
  const target = DIALECTS[to].map[sourceDef.generic];
  const targetDef = findType(DIALECTS[to], target.type);
  const result: TypedValue = { type: target.type };
  if (targetDef?.params === 'length' || target.length != null) {
    result.length = target.length ?? value.length ?? targetDef?.defaultLength;
  }
  if (targetDef?.params === 'precisionScale' || target.precision != null) {
    result.precision = target.precision ?? value.precision ?? targetDef?.defaultPrecision;
    result.scale = target.scale ?? value.scale ?? targetDef?.defaultScale;
  }
  return result;
};

/** Type a foreign key column takes when it references a column of the given type. */
export const fkTypeFor = (dialectId: DialectId, value: TypedValue): TypedValue => {
  const dialect = DIALECTS[dialectId];
  const def = findType(dialect, value.type);
  if (isEnum(value.type)) return enumStorage(dialectId, value.enumValues ?? []);
  if (def?.serial) {
    const name = value.type.toUpperCase();
    if (name === 'BIGSERIAL') return { type: 'BIGINT' };
    if (name === 'SMALLSERIAL') return { type: 'SMALLINT' };
    return { type: 'INTEGER' };
  }
  return { type: value.type, length: value.length, precision: value.precision, scale: value.scale };
};

export const isAutoIncrementable = (dialectId: DialectId, type: string) =>
  Boolean(findType(DIALECTS[dialectId], type)?.integer);

export const isSerial = (dialectId: DialectId, type: string) =>
  Boolean(findType(DIALECTS[dialectId], type)?.serial);

export const RESERVED_WORDS = new Set(
  `ADD ALL ALTER AND ANY AS ASC BETWEEN BY CASE CHECK COLUMN CONSTRAINT CREATE CROSS CURRENT_DATE
  CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END
  EXISTS FOREIGN FROM FULL GRANT GROUP HAVING IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT
  LIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES RIGHT ROW ROWS SELECT SESSION_USER
  SET SOME TABLE THEN TO UNION UNIQUE UPDATE USER USING VALUES VIEW WHEN WHERE WITH`
    .split(/\s+/)
    .filter(Boolean),
);

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const needsQuoting = (name: string) =>
  !SIMPLE_IDENTIFIER.test(name) || RESERVED_WORDS.has(name.toUpperCase());

export const quoteIdent = (dialectId: DialectId, name: string) =>
  needsQuoting(name) ? DIALECTS[dialectId].quote(name) : name;

/** Largest length each gestor accepts for types with a length parameter. */
const MAX_LENGTHS: Record<DialectId, Record<string, number>> = {
  postgresql: { CHAR: 10485760, VARCHAR: 10485760 },
  mysql: { CHAR: 255, VARCHAR: 65535, BINARY: 255, VARBINARY: 65535 },
  sqlite: {},
  sqlserver: { CHAR: 8000, VARCHAR: 8000, NCHAR: 4000, NVARCHAR: 4000, BINARY: 8000, VARBINARY: 8000 },
  oracle: { CHAR: 2000, VARCHAR2: 4000, NCHAR: 1000, NVARCHAR2: 2000, RAW: 2000 },
};

export const maxLengthFor = (dialectId: DialectId, type: string): number | undefined =>
  MAX_LENGTHS[dialectId][type.toUpperCase()];

/** Effective character limit of a column, or undefined when the type has none. */
export const lengthLimit = (dialectId: DialectId, col: Pick<Attribute, 'type' | 'length'>): number | undefined => {
  const def = findType(DIALECTS[dialectId], col.type);
  if (def?.params !== 'length') return undefined;
  return col.length ?? def.defaultLength;
};

export const isEnum = (type: string) => type.toUpperCase() === ENUM_TYPE;

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/**
 * ENUM is not real SQL: it is stored as a string sized to the longest allowed value,
 * guarded by a CHECK. Gestores without a sized string type (SQLite) use TEXT.
 */
export const enumStorage = (dialectId: DialectId, values: string[]): TypeRef => {
  const longest = Math.max(1, ...values.map((v) => [...v].length));
  const ascii = values.every((v) => /^[\x00-\x7f]*$/.test(v));
  switch (dialectId) {
    case 'sqlite':
      return { type: 'TEXT' };
    case 'sqlserver':
      return { type: ascii ? 'VARCHAR' : 'NVARCHAR', length: longest };
    case 'oracle':
      // VARCHAR2 counts bytes by default, so size it by the UTF-8 length.
      return { type: 'VARCHAR2', length: Math.max(1, ...values.map(utf8Length)) };
    default:
      return { type: 'VARCHAR', length: longest };
  }
};

/** Type as it must appear in the DDL (ENUM resolved to its storage type). */
export const ddlType = (dialectId: DialectId, col: TypedValue): string =>
  isEnum(col.type) ? formatType(dialectId, enumStorage(dialectId, col.enumValues ?? [])) : formatType(dialectId, col);

/** Short label for the diagram and grids. */
export const displayType = (dialectId: DialectId, col: TypedValue): string =>
  isEnum(col.type) ? 'enum' : formatType(dialectId, col).toLowerCase();

export const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
