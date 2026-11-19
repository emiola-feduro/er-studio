import { describe, expect, it } from 'vitest';
import { generateDdl } from './ddl';
import { quoteIdent } from './dialects';
import { importSchema } from './import';
import { buildSchema } from './inference';
import { buildSelect } from './query-builder';
import { sqlCompletions } from './sql-completion';

/** Tables and columns created in camelCase between quotes, as many Node and Prisma projects do. */
const DDL = `
CREATE TABLE "Clients" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username VARCHAR(15) NOT NULL UNIQUE, "dateOfBirth" DATE NOT NULL);
CREATE TABLE "Tickets" (id UUID PRIMARY KEY, title VARCHAR(100) NOT NULL, "openedAt" TIMESTAMPTZ(0) DEFAULT NOW() NOT NULL,
  "clientId" UUID NOT NULL, CONSTRAINT fk_tickets_clientId FOREIGN KEY ("clientId") REFERENCES "Clients"(id));
`;

const schema = () => buildSchema(importSchema(DDL, { name: 'x', dialect: 'postgresql', namesLocale: 'en' }).project);

describe('names whose case PostgreSQL would fold', () => {
  it('are quoted in PostgreSQL only', () => {
    expect(quoteIdent('postgresql', 'Clients')).toBe('"Clients"');
    expect(quoteIdent('postgresql', 'dateOfBirth')).toBe('"dateOfBirth"');
    expect(quoteIdent('postgresql', 'cliente_id')).toBe('cliente_id');
    expect(quoteIdent('mysql', 'Clients')).toBe('Clients');
    expect(quoteIdent('oracle', 'cliente')).toBe('cliente');
  });

  it('keep their case through import and DDL', () => {
    const ddl = generateDdl(schema(), 'postgresql').sql;
    expect(ddl).toContain('CREATE TABLE "Clients"');
    expect(ddl).toContain('"dateOfBirth" DATE NOT NULL');
    expect(ddl).toMatch(/FOREIGN KEY \("clientId"\) REFERENCES "Clients" \(id\)/);
  });

  it('are quoted in the generated query', () => {
    const s = schema();
    const clients = s.tables.find((t) => t.name === 'Clients')!;
    const tickets = s.tables.find((t) => t.name === 'Tickets')!;
    const { sql } = buildSelect(s, 'postgresql', { tableIds: [tickets.id, clients.id], limit: 10 });
    expect(sql).toMatch(/FROM "Tickets"/);
    expect(sql).toMatch(/JOIN "Clients"/);
    expect(sql).toMatch(/\."clientId"/);
    expect(sql).not.toMatch(/[^"]\bClients\b[^"]/);
  });

  it('are quoted by the editor completion', () => {
    const s = schema();
    const tables = sqlCompletions('SELECT * FROM ', 14, s, 'postgresql', '').items.map((i) => i.insert.trim());
    expect(tables).toContain('"Clients"');
    const text = 'SELECT  FROM "Clients" c';
    const columns = sqlCompletions(text, 7, s, 'postgresql', '').items.map((i) => i.insert);
    expect(columns.some((c) => c.includes('"dateOfBirth"'))).toBe(true);
  });
});
