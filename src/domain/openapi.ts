import { t } from '../i18n';
import { ddlType, DIALECTS, findType, isSerial } from './dialects';
import { randomValue, seededRng } from './random-values';
import { jsonValue } from './records-export';
import type { Column, Project, Schema, Table } from './types';

/**
 * OpenAPI 3.1 description of a CRUD REST API with one resource per table, ready to import into
 * Swagger UI, Postman, Insomnia, Bruno, Stoplight or Redocly. Summaries follow the interface language.
 */

type JsonSchema = Record<string, unknown>;
export type OpenApiDocument = Record<string, unknown> & {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema>; parameters: Record<string, unknown>; responses: Record<string, unknown> };
};

export type OpenApiOptions = {
  /** Tables to document; every table when omitted. */
  tableIds?: string[];
  serverUrl?: string;
  version?: string;
};

const pascal = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('') || 'Table';

/** URL segment for a table: its name, kept readable but safe in a path. */
const segment = (name: string) => encodeURIComponent(name.trim().replace(/\s+/g, '_'));

const isGenerated = (project: Project, column: Column) => column.autoIncrement || isSerial(project.dialect, column.type);

/** JSON value of a SQL default when it is a plain literal; functions such as CURRENT_TIMESTAMP are left out. */
const literalDefault = (project: Project, column: Column) => {
  const raw = column.defaultValue?.trim();
  if (!raw) return undefined;
  const quoted = /^N?'((?:[^']|'')*)'$/i.exec(raw);
  if (quoted) return jsonValue(project.dialect, column, quoted[1].replace(/''/g, "'"));
  if (/^[+-]?\d+(\.\d+)?$/.test(raw) || /^(true|false)$/i.test(raw)) return jsonValue(project.dialect, column, raw);
  return undefined;
};

/** JSON Schema for one column, from its portable type family. */
export const columnSchema = (project: Project, table: Table, column: Column, tables: Map<string, Table>): JsonSchema => {
  const def = findType(DIALECTS[project.dialect], column.type);
  const generic = def?.generic;
  let schema: JsonSchema;
  switch (generic) {
    case 'tinyint':
    case 'smallint':
    case 'int':
      schema = { type: 'integer', format: 'int32' };
      break;
    case 'bigint':
    case 'bigserial':
      schema = { type: 'integer', format: 'int64' };
      break;
    case 'serial':
    case 'year':
      schema = { type: 'integer' };
      break;
    case 'decimal':
    case 'money':
      schema = { type: 'number' };
      break;
    case 'real':
      schema = { type: 'number', format: 'float' };
      break;
    case 'double':
      schema = { type: 'number', format: 'double' };
      break;
    case 'bool':
      schema = { type: 'boolean' };
      break;
    case 'date':
      schema = { type: 'string', format: 'date' };
      break;
    case 'time':
      schema = { type: 'string', format: 'time' };
      break;
    case 'datetime':
    case 'timestamptz':
      schema = { type: 'string', format: 'date-time' };
      break;
    case 'interval':
      schema = { type: 'string', format: 'duration' };
      break;
    case 'uuid':
      schema = { type: 'string', format: 'uuid' };
      break;
    case 'json':
      schema = {};
      break;
    case 'binary':
    case 'varbinary':
    case 'blob':
      schema = { type: 'string', contentEncoding: 'base64' };
      break;
    case 'enum':
      schema = { type: 'string', enum: [...(column.enumValues ?? [])] };
      break;
    default:
      schema = { type: 'string' };
  }
  if (column.length != null && (generic === 'char' || generic === 'varchar' || generic === 'nchar' || generic === 'nvarchar')) {
    schema.maxLength = column.length;
  }
  if (column.nullable && !column.pk && schema.type) {
    schema.type = [schema.type, 'null'];
    if (Array.isArray(schema.enum)) schema.enum = [...(schema.enum as string[]), null];
  }

  const notes = [ddlType(project.dialect, column)];
  const fk = table.foreignKeys.find((f) => f.id === column.fkId);
  const ref = fk && tables.get(fk.refTableId);
  if (fk && ref) {
    const refColumn = ref.columns.find((c) => c.id === fk.refColumnIds[fk.columnIds.indexOf(column.id)]);
    notes.push(t('openapi.references', { target: `${ref.name}.${refColumn?.name ?? '?'}` }));
  }
  if (column.check?.trim()) notes.push(`CHECK (${column.check.trim()})`);
  if (column.defaultValue?.trim()) notes.push(`DEFAULT ${column.defaultValue.trim()}`);
  schema.description = notes.join('. ');
  const fallback = literalDefault(project, column);
  if (fallback !== undefined && fallback !== null) schema.default = fallback;
  if (isGenerated(project, column)) schema.readOnly = true;
  return schema;
};

/** Example object: the table's first record when there is one, otherwise sample values. */
const exampleFor = (project: Project, table: Table, columns: Column[]) => {
  const row = project.records?.[table.id]?.[0];
  const rng = seededRng(table.name.length * 31 + columns.length);
  return Object.fromEntries(
    columns.map((column) => {
      const raw = row?.values[column.id] ?? (isGenerated(project, column) ? '1' : (randomValue(project.dialect, column, rng) ?? ''));
      return [column.name, raw.trim() ? jsonValue(project.dialect, column, raw) : null];
    }),
  );
};

const json = (schema: unknown, example?: unknown) => ({ 'application/json': { schema, ...(example !== undefined ? { example } : {}) } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Builds the OpenAPI document for the chosen tables. */
export const buildOpenApi = (project: Project, schema: Schema, options: OpenApiOptions = {}): OpenApiDocument => {
  const tables = new Map(schema.tables.map((table) => [table.id, table]));
  const chosen = options.tableIds ? schema.tables.filter((table) => options.tableIds!.includes(table.id)) : schema.tables;
  const usedNames = new Set<string>();
  const schemaName = (table: Table) => {
    let name = pascal(table.name);
    for (let i = 2; usedNames.has(name); i += 1) name = `${pascal(table.name)}${i}`;
    usedNames.add(name);
    return name;
  };

  const doc: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: t('openapi.title', { project: project.name || t('common.project') }),
      version: options.version ?? '1.0.0',
      description: t('openapi.description', { dialect: DIALECTS[project.dialect].name }),
    },
    servers: [{ url: options.serverUrl?.trim() || 'http://localhost:3000' }],
    tags: [],
    paths: {},
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string' }, details: { type: 'array', items: { type: 'string' } } },
        },
      },
      parameters: {
        page: { name: 'page', in: 'query', description: t('openapi.page'), schema: { type: 'integer', minimum: 1, default: 1 } },
        pageSize: { name: 'pageSize', in: 'query', description: t('openapi.pageSize'), schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        sort: { name: 'sort', in: 'query', description: t('openapi.sort'), schema: { type: 'string' } },
      },
      responses: {
        BadRequest: { description: t('openapi.badRequest'), content: json(ref('Error')) },
        NotFound: { description: t('openapi.notFound'), content: json(ref('Error')) },
        Conflict: { description: t('openapi.conflict'), content: json(ref('Error')) },
      },
    },
  };
  const tags = doc.tags as { name: string; description?: string }[];

  for (const table of chosen) {
    const name = schemaName(table);
    const writable = table.columns.filter((c) => !isGenerated(project, c));
    const properties = (columns: Column[]) => Object.fromEntries(columns.map((c) => [c.name, columnSchema(project, table, c, tables)]));
    const required = (columns: Column[]) =>
      columns.filter((c) => (!c.nullable || c.pk) && !c.defaultValue?.trim() && !isGenerated(project, c)).map((c) => c.name);

    doc.components.schemas[name] = {
      type: 'object',
      required: table.columns.filter((c) => !c.nullable || c.pk).map((c) => c.name),
      properties: properties(table.columns),
      example: exampleFor(project, table, table.columns),
    };
    doc.components.schemas[`${name}Create`] = {
      type: 'object',
      required: required(writable),
      properties: properties(writable),
      example: exampleFor(project, table, writable),
    };
    doc.components.schemas[`${name}Update`] = {
      type: 'object',
      description: t('openapi.partial'),
      properties: properties(writable),
    };
    doc.components.schemas[`${name}List`] = {
      type: 'object',
      required: ['data', 'page', 'pageSize', 'total'],
      properties: { data: { type: 'array', items: ref(name) }, page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' } },
    };

    tags.push({ name: table.name, ...(table.kind === 'junction' ? { description: t('openapi.junction') } : {}) });
    const base = `/${segment(table.name)}`;
    const fkFilters = table.columns
      .filter((c) => c.origin === 'fk')
      .map((c) => ({ name: c.name, in: 'query', description: t('openapi.filterBy', { column: c.name }), schema: columnSchema(project, table, { ...c, nullable: false }, tables) }));

    doc.paths[base] = {
      get: {
        tags: [table.name],
        operationId: `list${name}`,
        summary: t('openapi.list', { table: table.name }),
        parameters: [{ $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }, { $ref: '#/components/parameters/sort' }, ...fkFilters],
        responses: { 200: { description: t('openapi.ok'), content: json(ref(`${name}List`)) }, 400: { $ref: '#/components/responses/BadRequest' } },
      },
      post: {
        tags: [table.name],
        operationId: `create${name}`,
        summary: t('openapi.create', { table: table.name }),
        requestBody: { required: true, content: json(ref(`${name}Create`)) },
        responses: {
          201: { description: t('openapi.created'), content: json(ref(name)) },
          400: { $ref: '#/components/responses/BadRequest' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    };

    // Item routes need a key. A composite key becomes one path segment per column.
    const keyColumns = (table.pk?.columnIds ?? []).map((id) => table.columns.find((c) => c.id === id)).filter((c): c is Column => Boolean(c));
    if (keyColumns.length === 0) continue;
    const itemPath = `${base}/${keyColumns.map((c) => `{${c.name}}`).join('/')}`;
    const keyParams = keyColumns.map((c) => ({
      name: c.name,
      in: 'path',
      required: true,
      schema: columnSchema(project, table, { ...c, nullable: false, autoIncrement: false }, tables),
    }));
    const notFound = { $ref: '#/components/responses/NotFound' };
    doc.paths[itemPath] = {
      parameters: keyParams,
      get: {
        tags: [table.name],
        operationId: `get${name}`,
        summary: t('openapi.get', { table: table.name }),
        responses: { 200: { description: t('openapi.ok'), content: json(ref(name)) }, 404: notFound },
      },
      put: {
        tags: [table.name],
        operationId: `replace${name}`,
        summary: t('openapi.replace', { table: table.name }),
        requestBody: { required: true, content: json(ref(`${name}Create`)) },
        responses: {
          200: { description: t('openapi.ok'), content: json(ref(name)) },
          400: { $ref: '#/components/responses/BadRequest' },
          404: notFound,
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
      patch: {
        tags: [table.name],
        operationId: `update${name}`,
        summary: t('openapi.update', { table: table.name }),
        requestBody: { required: true, content: json(ref(`${name}Update`)) },
        responses: {
          200: { description: t('openapi.ok'), content: json(ref(name)) },
          400: { $ref: '#/components/responses/BadRequest' },
          404: notFound,
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: [table.name],
        operationId: `delete${name}`,
        summary: t('openapi.delete', { table: table.name }),
        responses: { 204: { description: t('openapi.deleted') }, 404: notFound, 409: { $ref: '#/components/responses/Conflict' } },
      },
    };
  }
  return doc;
};

export const openApiJson = (doc: OpenApiDocument) => `${JSON.stringify(doc, null, 2)}\n`;

/** YAML text; loaded on demand so the library only downloads when someone exports YAML. */
export const openApiYaml = async (doc: OpenApiDocument) => {
  const { stringify } = await import('yaml');
  return stringify(doc, { aliasDuplicateObjects: false, lineWidth: 0 });
};
