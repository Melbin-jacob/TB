import { describe, expect, it } from 'vitest';
import { isUnit, pricePerDisplayUnit, toBase, UnitError, unitDimension } from '@/lib/engine/units';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof UnitError ? e.code : 'NOT_A_UNIT_ERROR';
  }
  return undefined;
}

describe('toBase — mass (grams)', () => {
  it.each([
    [500, 'g', 500],
    [1.5, 'kg', 1500],
    [1, 'lb', 454], // 453.59237 g rounded
    [2, 'lb', 907], // 907.18474 g
    [16, 'oz', 454], // 16 oz = 1 lb
    [12, 'oz', 340], // 340.19 g
  ])('%s %s → %s g', (qty, unit, expected) => {
    expect(toBase(qty, unit, 'mass')).toBe(expected);
  });
});

describe('toBase — volume (millilitres)', () => {
  it.each([
    [946, 'mL', 946],
    [4, 'L', 4000],
    [0.5, 'L', 500],
  ])('%s %s → %s mL', (qty, unit, expected) => {
    expect(toBase(qty, unit, 'volume')).toBe(expected);
  });
});

describe('toBase — count', () => {
  it.each([
    [6, 'each', 6],
    [2, 'dozen', 24],
  ])('%s %s → %s each', (qty, unit, expected) => {
    expect(toBase(qty, unit, 'count')).toBe(expected);
  });
});

describe('toBase — refusals', () => {
  it('never converts volume to mass or vice versa', () => {
    expect(codeOf(() => toBase(1, 'L', 'mass'))).toBe('DIMENSION_MISMATCH');
    expect(codeOf(() => toBase(500, 'g', 'volume'))).toBe('DIMENSION_MISMATCH');
    expect(codeOf(() => toBase(1, 'kg', 'count'))).toBe('DIMENSION_MISMATCH');
  });

  it('rejects fluid ounces and other unknown units', () => {
    expect(codeOf(() => toBase(16, 'fl oz', 'volume'))).toBe('UNKNOWN_UNIT');
    expect(codeOf(() => toBase(1, 'cup'))).toBe('UNKNOWN_UNIT');
    expect(codeOf(() => toBase(1, 'KG'))).toBe('UNKNOWN_UNIT'); // units are case-sensitive
  });

  it('rejects zero, negative, non-finite and sub-base-unit quantities', () => {
    expect(codeOf(() => toBase(0, 'kg'))).toBe('INVALID_QUANTITY');
    expect(codeOf(() => toBase(-1, 'kg'))).toBe('INVALID_QUANTITY');
    expect(codeOf(() => toBase(Number.NaN, 'kg'))).toBe('INVALID_QUANTITY');
    expect(codeOf(() => toBase(0.4, 'g'))).toBe('INVALID_QUANTITY');
  });

  it('works without an expected dimension', () => {
    expect(toBase(1, 'L')).toBe(1000);
  });
});

describe('isUnit / unitDimension', () => {
  it('recognizes supported units only', () => {
    expect(isUnit('kg')).toBe(true);
    expect(isUnit('fl oz')).toBe(false);
    expect(isUnit('toString')).toBe(false); // no prototype leakage
  });

  it('reports dimensions', () => {
    expect(unitDimension('oz')).toBe('mass');
    expect(unitDimension('mL')).toBe('volume');
    expect(unitDimension('dozen')).toBe('count');
  });
});

describe('pricePerDisplayUnit', () => {
  it('computes $/kg from a pack', () => {
    // 650 g for $4.49 → $6.907.../kg → rounded up to $6.91
    expect(pricePerDisplayUnit(449, 650, 'mass')).toBe(691);
  });

  it('computes $/kg from a per-lb price', () => {
    // $3.99/lb → 399 * 1000 / 453.59237 = 879.64 → $8.80/kg
    expect(pricePerDisplayUnit(399, 453.59237, 'mass')).toBe(880);
  });

  it('computes $/L and $/each', () => {
    expect(pricePerDisplayUnit(599, 4000, 'volume')).toBe(150); // 4 L for $5.99 → $1.4975/L → $1.50
    expect(pricePerDisplayUnit(429, 12, 'count')).toBe(36); // dozen eggs $4.29 → $0.3575 → $0.36
  });

  it('rejects non-positive quantities', () => {
    expect(() => pricePerDisplayUnit(100, 0, 'mass')).toThrow(UnitError);
  });
});
