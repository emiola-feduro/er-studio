import { describe, expect, it } from 'vitest';
import { formatList, LOCALES, t } from '.';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { pt } from './messages/pt';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  it('translate every key with the same placeholders as Spanish', () => {
    for (const [name, catalog] of Object.entries({ en, fr, pt })) {
      for (const [key, source] of Object.entries(es)) {
        const text = catalog[key as keyof typeof es];
        expect(text, `${name} ${key}`).toBeTruthy();
        expect(placeholders(text), `${name} ${key}`).toEqual(placeholders(source));
      }
    }
  });

  it('has a name for each language', () => {
    expect(LOCALES.map((l) => l.id)).toEqual(['es', 'en', 'fr', 'pt']);
  });
});

describe('t', () => {
  it('fills placeholders and picks the singular form', () => {
    expect(t('records.rowCount', { count: 3 }, 'es')).toBe('3 registros');
    expect(t('records.rowCount', { count: 1 }, 'es')).toBe('1 registro');
    expect(t('records.rowCount', { count: 1 }, 'en')).toBe('1 record');
    expect(t('projects.noMatch', { query: 'abc' }, 'fr')).toBe('Aucun projet ne correspond à « abc »');
  });

  it('joins lists the way each language does', () => {
    expect(formatList(['a', 'b', 'c'], 'es')).toBe('a, b y c');
    expect(formatList(['a', 'b'], 'en')).toBe('a and b');
  });
});
