import { describe, expect, it } from 'vitest';
import { fitWidth } from './column-fit';

const measure = (text: string, bold = false) => text.length * (bold ? 8 : 7);

describe('fitWidth', () => {
  it('fits the widest of header and values plus padding', () => {
    expect(fitWidth(['nombre'], ['Ana', 'Luis Gómez'], measure, { extra: 20, min: 40, max: 400 })).toBe(90);
    expect(fitWidth(['descripcion_larga'], ['x'], measure, { extra: 20, min: 40, max: 400, headerExtra: 10 })).toBe(146);
  });

  it('stays within the limits', () => {
    expect(fitWidth(['id'], ['1'], measure, { extra: 4, min: 56, max: 400 })).toBe(56);
    expect(fitWidth(['t'], ['x'.repeat(200)], measure, { extra: 4, min: 56, max: 400 })).toBe(400);
  });
});
