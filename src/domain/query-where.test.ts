import { describe, expect, it } from 'vitest';
import { operatorsFor, whereCompletions, type WhereColumn } from './query-where';

const columns: WhereColumn[] = [
  { ref: 'pr.precio', column: { name: 'precio', type: 'NUMERIC', nullable: false } },
  { ref: 'c.email', column: { name: 'email', type: 'VARCHAR', nullable: true } },
  { ref: 'pe.fecha', column: { name: 'fecha', type: 'DATE', nullable: false } },
  { ref: 'pe.estado', column: { name: 'estado', type: 'ENUM', nullable: false, enumValues: ['pendiente', 'pagado'] } },
  { ref: 'c.activo', column: { name: 'activo', type: 'BOOLEAN', nullable: false } },
];
const values = (text: string, dialect: 'postgresql' | 'mysql' | 'sqlserver' = 'postgresql') => whereCompletions(dialect, columns, text, 'texto').map((c) => c.value);

describe('WHERE completions', () => {
  it('offers one condition per column on an empty field', () => {
    expect(values('')).toEqual(["pr.precio = 1", "c.email LIKE '%@example.com'", "pe.fecha >= CURRENT_DATE - INTERVAL '30 days'", "pe.estado = 'pendiente'", 'c.activo = TRUE']);
  });

  it('offers operators that fit the type after a column', () => {
    expect(values('pr.precio ')).toContain('pr.precio BETWEEN 1 AND 100');
    expect(values('c.email')).toContain("c.email ILIKE '%texto%'");
    expect(values('c.email', 'mysql')).not.toContain("c.email ILIKE '%texto%'");
    expect(values('c.email')).toContain('c.email IS NULL');
    expect(values('pe.estado ')).toContain("pe.estado IN ('pendiente', 'pagado')");
    expect(values('pe.fecha', 'mysql')).toContain('pe.fecha >= CURDATE() - INTERVAL 30 DAY');
    const bit: WhereColumn = { ref: 'c.activo', column: { name: 'activo', type: 'BIT', nullable: false } };
    expect(whereCompletions('sqlserver', [bit], 'c.activo', 'x').map((c) => c.value)).toEqual(['c.activo = 1', 'c.activo = 0']);
  });

  it('continues with AND or OR after a complete condition, then with the columns', () => {
    expect(values('pr.precio > 0 ')).toEqual(['pr.precio > 0\nAND ', 'pr.precio > 0\nOR ']);
    expect(values('pr.precio > 0\n')).toEqual(['pr.precio > 0\nAND ', 'pr.precio > 0\nOR ']);
    expect(values("c.email LIKE '%a b ")).toEqual([]);
    expect(values('pr.precio > ')).toEqual([]);
    expect(values('pr.precio > 0\nAND ')[0]).toBe('pr.precio > 0\nAND pr.precio ');
    expect(values('pr.precio > 0\nAND (')[0]).toBe('pr.precio > 0\nAND (pr.precio ');
    expect(values('pr.precio > 0\nAND pe.estado ')).toContain("pr.precio > 0\nAND pe.estado = 'pagado'");
  });

  it('suggests nothing to start with when there is text after the cursor', () => {
    expect(whereCompletions('postgresql', columns, '', 'x', 'pr.precio > 0')).toEqual([]);
  });

  it('only suggests IS NULL for nullable columns', () => {
    expect(operatorsFor('postgresql', columns[0].column, 'x').some((o) => o.op === 'IS NULL')).toBe(false);
  });

  it('offers negative conditions', () => {
    expect(values('pr.precio ')).toEqual(expect.arrayContaining(['pr.precio <> 1', 'pr.precio NOT BETWEEN 1 AND 100', 'pr.precio NOT IN (1, 2, 3)']));
    expect(values('c.email ')).toEqual(expect.arrayContaining(["c.email NOT LIKE '%texto%'", "c.email <> 'texto'"]));
    expect(values('pe.estado ')).toEqual(expect.arrayContaining(["pe.estado <> 'pendiente'", "pe.estado NOT IN ('pendiente', 'pagado')"]));
    expect(values('pe.fecha ')).toEqual(expect.arrayContaining([expect.stringMatching(/^pe\.fecha NOT BETWEEN /), expect.stringMatching(/^pe\.fecha < /)]));
  });

  it('continues after NOT and after a comparison', () => {
    expect(values('pr.precio NOT ')).toEqual(['pr.precio NOT BETWEEN 1 AND 100', 'pr.precio NOT IN (1, 2, 3)']);
    expect(values("c.email not")).toEqual(["c.email not LIKE '%texto%'"]);
    expect(values('pe.estado != ')).toEqual(["pe.estado != 'pendiente'", "pe.estado != 'pagado'"]);
    expect(values('pe.estado<>')).toEqual(["pe.estado<> 'pendiente'", "pe.estado<> 'pagado'"]);
    expect(values('pr.precio > 0 AND pr.precio <> ')).toEqual(['pr.precio > 0 AND pr.precio <> 1', 'pr.precio > 0 AND pr.precio <> 0']);
  });
});
