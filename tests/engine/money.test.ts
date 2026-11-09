import { describe, expect, it } from 'vitest';
import { assertCents, ceilCents, formatCents, isCents } from '@/lib/engine/money';

describe('isCents / assertCents', () => {
  it('accepts non-negative integers', () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(499)).toBe(true);
  });

  it('rejects fractions, negatives, NaN and non-numbers', () => {
    for (const bad of [4.99, -1, Number.NaN, Number.POSITIVE_INFINITY, '499', null]) {
      expect(isCents(bad)).toBe(false);
    }
    expect(() => assertCents(4.99, 'price')).toThrow(/price must be/);
  });
});

describe('ceilCents', () => {
  it('rounds fractional cents up', () => {
    expect(ceilCents(398.01)).toBe(399);
    expect(ceilCents(0.2)).toBe(1);
  });

  it('ignores floating-point noise just above an integer', () => {
    // 0.1 * 3 * 1000 = 300.00000000000006 in IEEE-754
    expect(ceilCents(0.1 * 3 * 1000)).toBe(300);
  });

  it('keeps whole cents unchanged', () => {
    expect(ceilCents(500)).toBe(500);
    expect(ceilCents(0)).toBe(0);
  });

  it('rejects negative or non-finite input', () => {
    expect(() => ceilCents(-1)).toThrow(RangeError);
    expect(() => ceilCents(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatCents', () => {
  it('formats as Canadian dollars', () => {
    expect(formatCents(1299)).toBe('$12.99');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456)).toBe('$1,234.56');
  });

  it('formats negative deltas', () => {
    expect(formatCents(-250)).toBe('-$2.50');
  });

  it('rejects non-integers', () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
  });
});
