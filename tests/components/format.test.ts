import { describe, expect, it } from 'vitest';
import { formatAmount, formatIsoDate, formatUnitPrice, UNITS_FOR } from '@/components/format';

describe('formatAmount', () => {
  it.each([
    [907, 'mass', '907 g'],
    [1000, 'mass', '1 kg'],
    [1361, 'mass', '1.36 kg'],
    [540, 'volume', '540 mL'],
    [4000, 'volume', '4 L'],
    [1540, 'volume', '1.54 L'],
    [12, 'count', '12'],
  ] as const)('%i %s → %s', (base, dim, out) => {
    expect(formatAmount(base, dim)).toBe(out);
  });
});

describe('formatUnitPrice', () => {
  it('formats per kg, per L and each', () => {
    expect(formatUnitPrice(439, 'kg')).toBe('$4.39/kg');
    expect(formatUnitPrice(150, 'L')).toBe('$1.50/L');
    expect(formatUnitPrice(36, 'each')).toBe('$0.36 each');
  });
});

describe('formatIsoDate', () => {
  it('formats without time-zone drift', () => {
    expect(formatIsoDate('2026-11-09')).toMatch(/Nov\.? 9, 2026/);
  });
});

describe('UNITS_FOR', () => {
  it('never offers fluid ounces and keeps dimensions separate', () => {
    expect(Object.values(UNITS_FOR).flat()).not.toContain('fl oz');
    expect(UNITS_FOR.volume).not.toContain('kg');
  });
});
