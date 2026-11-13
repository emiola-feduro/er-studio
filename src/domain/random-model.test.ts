import { describe, expect, it } from 'vitest';
import { DIALECT_LIST } from './dialects';
import { buildSchema } from './inference';
import { fillRandomRecords, generateRandomModel, maxEntities, THEMES } from './random-model';
import { seededRng } from './random-values';
import { validateRecords } from './records';
import { validateProject } from './validation';

describe('generateRandomModel', () => {
  it('builds every theme in every gestor without issues and with valid random rows', () => {
    for (const theme of THEMES) {
      for (const { id: dialect } of DIALECT_LIST) {
        const project = generateRandomModel({ dialect, entityCount: 99, themeId: theme.id, rng: seededRng(3) });
        const schema = buildSchema(project);
        const issues = validateProject(project, schema);
        expect(issues.map((i) => i.message), `${theme.id} ${dialect}`).toEqual([]);

        fillRandomRecords(project, 25, seededRng(4));
        const records = validateRecords(project, buildSchema(project));
        const detail = [...records.cells.entries()].flatMap(([table, rows]) =>
          [...rows.values()].flatMap((cols) => [...cols.values()].map((m) => `${schema.tables.find((t) => t.id === table)?.name}: ${m}`)),
        );
        expect(detail, `${theme.id} ${dialect}`).toEqual([]);
      }
    }
  });

  it('keeps the requested number of entities connected', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const project = generateRandomModel({ dialect: 'postgresql', entityCount: 3, rng: seededRng(seed) });
      const regular = project.entities.filter((e) => e.kind === 'entity');
      expect(regular).toHaveLength(3);
      const linked = new Set(project.relationships.flatMap((r) => r.participants.map((p) => p.entityId)));
      for (const entity of regular) expect(linked.has(entity.id)).toBe(true);
    }
  });

  it('limits the count to the size of the theme', () => {
    const project = generateRandomModel({ dialect: 'mysql', entityCount: 50, themeId: 'hospital', rng: seededRng(1) });
    expect(project.entities.filter((e) => e.kind === 'entity')).toHaveLength(maxEntities('hospital'));
  });

  it('fills junction tables without repeating keys and referenced tables first', () => {
    const project = generateRandomModel({ dialect: 'postgresql', entityCount: 99, themeId: 'biblioteca', rng: seededRng(5) });
    fillRandomRecords(project, 3, seededRng(6));
    const schema = buildSchema(project);
    const junction = schema.tables.find((t) => t.kind === 'junction')!;
    // 3 autores x 3 libros = 9 combinations, so at most 4 rows.
    expect(project.records![junction.id].length).toBeLessThanOrEqual(4);
    expect(validateRecords(project, schema).total).toBe(0);
  });
});

describe('names language', () => {
  it('builds every theme with names in each language, without issues, and fills valid rows', () => {
    for (const theme of THEMES) {
      for (const namesLocale of ['en', 'fr', 'pt'] as const) {
        const project = generateRandomModel({ dialect: 'postgresql', entityCount: 99, themeId: theme.id, namesLocale, rng: seededRng(8) });
        const schema = buildSchema(project);
        expect(validateProject(project, schema).map((i) => i.message), `${theme.id} ${namesLocale}`).toEqual([]);
        fillRandomRecords(project, 15, seededRng(9), namesLocale);
        expect(validateRecords(project, buildSchema(project)).total, `${theme.id} ${namesLocale}`).toBe(0);
      }
    }
  });

  it('translates tables, columns, ENUM values and the project name', () => {
    const project = generateRandomModel({ dialect: 'postgresql', entityCount: 99, themeId: 'tienda', namesLocale: 'en', rng: seededRng(2) });
    expect(project.name).toBe('Store');
    const names = project.entities.map((e) => e.name);
    expect(names).toContain('customer');
    expect(names).toContain('order_header_product');
    const order = project.entities.find((e) => e.name === 'order_header')!;
    expect(order.attributes.find((a) => a.name === 'status')?.enumValues).toEqual(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED']);
  });

  it('writes sample text in the chosen language', () => {
    const project = generateRandomModel({ dialect: 'postgresql', entityCount: 99, themeId: 'tienda', namesLocale: 'fr', rng: seededRng(2) });
    fillRandomRecords(project, 5, seededRng(3), 'fr');
    const client = project.entities.find((e) => e.name === 'client')!;
    const email = client.attributes.find((a) => a.name === 'email')!;
    expect(project.records![client.id][0].values[email.id]).toMatch(/@exemple\.com$/);
  });
});
