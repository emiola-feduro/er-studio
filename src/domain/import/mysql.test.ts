import { describe, expect, it } from 'vitest';
import { generateDdl } from '../ddl';
import { buildSchema } from '../inference';
import { importIr } from '.';
import type { Ir } from './ir';
import mysql from './fixtures/mysql-schema.json';
import mariadb from './fixtures/mariadb-schema.json';

/** What the desktop side read from MySQL 8.4 and MariaDB 11 (crates/er-db/tests/engines.rs). */
for (const [label, fixture] of [
  ['MySQL', mysql],
  ['MariaDB', mariadb],
] as const) {
  describe(`a schema read from ${label}`, () => {
    const read = fixture as unknown as { ir: Ir };
    const { project, report } = importIr(structuredClone(read.ir), 'sql', { name: 'tienda', dialect: 'mysql', namesLocale: 'es' });

    it('becomes the same entities, with the enum, the keys and the cascade', () => {
      expect(project.entities.map((e) => e.name).sort()).toEqual(['cliente', 'pedido']);
      const cliente = project.entities.find((e) => e.name === 'cliente')!;
      expect(cliente.attributes.find((a) => a.name === 'tipo')).toMatchObject({ type: 'ENUM', enumValues: ['persona', 'empresa'] });
      expect(cliente.attributes.find((a) => a.name === 'id')).toMatchObject({ autoIncrement: true, pk: true });
      expect(project.relationships).toHaveLength(1);
      expect(project.relationships[0].onDelete).toBe('CASCADE');
      expect(report.warnings).toContain('skipped:VIEW v_cliente');
    });

    it('gives back MySQL DDL', () => {
      const ddl = generateDdl(buildSchema(project), 'mysql').sql;
      expect(ddl).toMatch(/CHECK \(tipo IN \('persona', 'empresa'\)\)/);
      expect(ddl).toMatch(/AUTO_INCREMENT/);
      expect(ddl).toMatch(/idx_pedido_total/);
    });
  });
}
