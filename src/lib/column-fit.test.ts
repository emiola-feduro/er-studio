import { describe, expect, it } from 'vitest';
import { fillWidths, fitWidth, naturalForShown } from './column-fit';

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

describe('filling the space', () => {
  it('grows the columns in proportion until the table fills the space', () => {
    expect(fillWidths([100, 200, 100], 800)).toEqual([200, 400, 200]);
    expect(fillWidths([300, 300], 500)).toEqual([300, 300]);
  });

  it('keeps the dragged column under the pointer', () => {
    const others = 300;
    const available = 800;
    const kept = naturalForShown(250, others, available);
    expect(fillWidths([kept, others], available)[0]).toBeCloseTo(250);
    expect(naturalForShown(600, others, available)).toBe(600);
  });
});
