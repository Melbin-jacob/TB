import type { Cents } from './types';

/** Tolerance for floating-point noise when rounding fractional cents (e.g. 399.00000000001). */
const FLOAT_EPSILON = 1e-9;

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function assertCents(value: unknown, label = 'amount'): asserts value is Cents {
  if (!isCents(value)) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${String(value)}`);
  }
}

/**
 * Rounds a (possibly fractional) cent amount up to a whole cent, ignoring float noise.
 * Used once per computed price so the shopper is never under-quoted.
 */
export function ceilCents(amount: number): Cents {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`cannot round invalid cent amount ${amount}`);
  }
  // Math.max also normalizes -0 (from ceil of a tiny negative) to 0.
  return Math.max(0, Math.ceil(amount - FLOAT_EPSILON));
}

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

/** Formats cents as Canadian dollars, e.g. 1299 → "$12.99". Negative values are allowed (savings deltas). */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`cannot format non-integer cents ${cents}`);
  }
  return CAD.format(cents / 100);
}
