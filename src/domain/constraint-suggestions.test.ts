import { describe, expect, it } from 'vitest';
import { checkSuggestions, regexExpression, unknownIdentifiers, whereSuggestions } from './constraint-suggestions';

const col = (name: string, type: string, extra: { nullable?: boolean; enumValues?: string[] } = {}) => ({ name, type, nullable: false, ...extra });
const values = (list: { value: string }[]) => list.map((s) => s.value);

describe('checkSuggestions', () => {
  it('fits numbers, text and dates in each gestor', () => {
    expect(values(checkSuggestions('postgresql', col('precio', 'NUMERIC')))).toEqual(['precio >= 0', 'precio > 0', 'precio BETWEEN 1 AND 100']);
    const text = values(checkSuggestions('sqlserver', col('nombre', 'NVARCHAR')));
    expect(text).toContain("TRIM(nombre) <> ''");
    expect(text).toContain('LEN(nombre) >= 3');
    expect(values(checkSuggestions('oracle', col('nombre', 'VARCHAR2')))).toContain('TRIM(nombre) IS NOT NULL');
    expect(values(checkSuggestions('mysql', col('nombre', 'VARCHAR')))).toContain('CHAR_LENGTH(nombre) >= 3');
    expect(values(checkSuggestions('postgresql', col('alta', 'DATE')))).toEqual(["alta >= DATE '2000-01-01'"]);
    expect(values(checkSuggestions('sqlite', col('alta', 'DATE')))).toEqual(["alta >= '2000-01-01'"]);
    expect(checkSuggestions('postgresql', col('activo', 'BOOLEAN'))).toEqual([]);
  });

  it('puts the regular expression that matches the column name first', () => {
    expect(checkSuggestions('postgresql', col('email', 'VARCHAR'))[0]).toMatchObject({ meaning: 'regex.email', value: "email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'" });
    expect(checkSuggestions('oracle', col('telefono', 'VARCHAR2'))[0].value).toBe("REGEXP_LIKE(telefono, '^\\+?[0-9 ]{7,15}$')");
    expect(checkSuggestions('sqlserver', col('codigo', 'VARCHAR'))[0].value).toBe("codigo NOT LIKE '%[^A-Z0-9_-]%'");
  });
});

describe('regexExpression', () => {
  it('uses each gestor syntax and has no form for SQL Server', () => {
    expect(regexExpression('postgresql', 'sku', '^[A-Z]{3}$')).toBe("sku ~ '^[A-Z]{3}$'");
    expect(regexExpression('mysql', 'sku', '^[A-Z]{3}$')).toBe("sku REGEXP '^[A-Z]{3}$'");
    expect(regexExpression('oracle', 'sku', "it's")).toBe("REGEXP_LIKE(sku, 'it''s')");
    expect(regexExpression('sqlserver', 'sku', 'x')).toBeNull();
  });
});

describe('whereSuggestions', () => {
  it('suggests IS NOT NULL, booleans, ENUM values and soft delete', () => {
    const list = whereSuggestions(
      'postgresql',
      [col('email', 'VARCHAR', { nullable: true })],
      [col('activo', 'BOOLEAN'), col('estado', 'ENUM', { enumValues: ['A', 'B'] }), col('borrado_en', 'TIMESTAMP', { nullable: true })],
    );
    expect(values(list)).toEqual(['email IS NOT NULL', 'activo = TRUE', "estado = 'A'", "estado = 'B'", 'borrado_en IS NULL']);
    expect(values(whereSuggestions('sqlserver', [], [col('activo', 'BIT')]))).toEqual(['activo = 1']);
  });
});

describe('unknownIdentifiers', () => {
  it('finds typos but not SQL words, functions or strings', () => {
    expect(unknownIdentifiers("precio_unitaro >= 0 AND estado IN ('a', 'precio')", ['precio_unitario', 'estado'])).toEqual(['precio_unitaro']);
    expect(unknownIdentifiers("TRIM(nombre) <> '' AND LENGTH(nombre) BETWEEN 1 AND 5", ['nombre'])).toEqual([]);
    expect(unknownIdentifiers('"Order" > 0', ['order'])).toEqual([]);
  });
});
