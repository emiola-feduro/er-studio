import { describe, expect, it } from 'vitest';
import { importSchema } from './import';
import { buildSchema } from './inference';
import { diffSchemas } from './migration';
import { alignByName } from './schema-align';

const model = `CREATE TABLE cliente (id SERIAL PRIMARY KEY, nombre VARCHAR(80) NOT NULL, email VARCHAR(120));
CREATE TABLE pedido (id SERIAL PRIMARY KEY, cliente_id INT NOT NULL REFERENCES cliente (id), total NUMERIC(10, 2) NOT NULL);
CREATE INDEX idx_pedido_total ON pedido (total);`;

const schemaOf = (ddl: string) => buildSchema(importSchema(ddl, { name: 'x', dialect: 'postgresql', namesLocale: 'es' }).project);

describe('alignByName', () => {
  it('finds no changes between a database and the same model', () => {
    const target = schemaOf(model);
    expect(diffSchemas(alignByName(schemaOf(model), target), target, 'postgresql').changes).toEqual([]);
  });

  it('only reports what really differs', () => {
    const target = schemaOf(model);
    const liveDdl = model.replace('email VARCHAR(120)', 'telefono VARCHAR(20)').replace('CREATE INDEX idx_pedido_total ON pedido (total);', '');
    const migration = diffSchemas(alignByName(schemaOf(liveDdl), target), target, 'postgresql');
    expect(migration.sql).toMatch(/ADD COLUMN "?email"? VARCHAR\(120\)/i);
    expect(migration.sql).toMatch(/DROP COLUMN "?telefono"?/i);
    expect(migration.sql).toMatch(/CREATE INDEX "?idx_pedido_total"?/i);
    expect(migration.sql).not.toMatch(/CREATE TABLE/i);
  });
});
