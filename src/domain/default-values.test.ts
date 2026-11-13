import { describe, expect, it } from 'vitest';
import { defaultSuggestions, defaultValueProblem } from './default-values';
import { makeProject } from './fixtures';
import { buildSchema } from './inference';
import { createAttribute } from './model';
import { validateProject } from './validation';

const values = (...args: Parameters<typeof defaultSuggestions>) => defaultSuggestions(...args).map((x) => x.value);

describe('defaultSuggestions', () => {
  it('suggests the current moment in each gestor syntax', () => {
    expect(values('postgresql', { type: 'TIMESTAMPTZ', autoIncrement: false })).toEqual(['CURRENT_TIMESTAMP']);
    expect(values('postgresql', { type: 'TIMESTAMP', autoIncrement: false })).toEqual(['LOCALTIMESTAMP']);
    expect(values('sqlserver', { type: 'DATETIMEOFFSET', autoIncrement: false })).toEqual(['SYSDATETIMEOFFSET()']);
    expect(values('oracle', { type: 'TIMESTAMP WITH TIME ZONE', autoIncrement: false })).toEqual(['SYSTIMESTAMP']);
    expect(values('mysql', { type: 'DATE', autoIncrement: false })).toEqual(['(CURRENT_DATE)']);
  });

  it('fits booleans, numbers, text, UUID and ENUM', () => {
    expect(values('sqlserver', { type: 'BIT', autoIncrement: false })).toEqual(['1', '0']);
    expect(values('postgresql', { type: 'BOOLEAN', autoIncrement: false })).toEqual(['TRUE', 'FALSE']);
    expect(values('postgresql', { type: 'NUMERIC', autoIncrement: false })).toEqual(['0', '1']);
    expect(values('postgresql', { type: 'VARCHAR', autoIncrement: false })).toEqual(["''"]);
    expect(values('postgresql', { type: 'UUID', autoIncrement: false })).toEqual(['gen_random_uuid()']);
    expect(values('postgresql', { type: 'ENUM', enumValues: ['A', "it's"], autoIncrement: false })).toEqual(["'A'", "'it''s'"]);
  });

  it('suggests nothing for auto increment columns', () => {
    expect(values('postgresql', { type: 'INTEGER', autoIncrement: true })).toEqual([]);
    expect(values('postgresql', { type: 'SERIAL', autoIncrement: false })).toEqual([]);
  });
});

describe('defaultValueProblem', () => {
  const problem = (type: string, defaultValue: string, dialect: Parameters<typeof defaultValueProblem>[0] = 'postgresql') =>
    defaultValueProblem(dialect, { type, defaultValue, autoIncrement: false });

  it('flags common mistakes', () => {
    expect(problem('VARCHAR', 'pendiente')).toBe('unquotedText');
    expect(problem('INTEGER', 'uno')).toBe('notANumber');
    expect(problem('BIT', 'TRUE', 'sqlserver')).toBe('notABoolean');
    expect(problem('DATE', '2024-01-01')).toBe('unquotedDate');
  });

  it('accepts valid values and expressions', () => {
    expect(problem('VARCHAR', "'pendiente'")).toBeNull();
    expect(problem('VARCHAR', 'CURRENT_USER')).toBeNull();
    expect(problem('INTEGER', '-3')).toBeNull();
    expect(problem('TIMESTAMPTZ', 'CURRENT_TIMESTAMP')).toBeNull();
    expect(problem('DATE', "'2024-01-01'")).toBeNull();
    expect(problem('BOOLEAN', 'false')).toBeNull();
  });

  it('shows up as a warning in validation', () => {
    const b = makeProject('postgresql');
    b.entity('pedido').attributes.push(createAttribute('postgresql', { name: 'estado', defaultValue: 'pendiente' }));
    const issues = validateProject(b.project, buildSchema(b.project));
    expect(issues.find((i) => i.message.includes("'pendiente'"))?.level).toBe('warning');
  });
});
