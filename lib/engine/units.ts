import { ceilCents } from './money';
import type { Cents, Dimension, DisplayUnit, Unit } from './types';

/** Base units are integers: grams (mass), millilitres (volume), each (count). */
interface UnitInfo {
  dimension: Dimension;
  /** How many base units one of this unit represents. */
  toBase: number;
}

export const UNITS: Readonly<Record<Unit, UnitInfo>> = {
  g: { dimension: 'mass', toBase: 1 },
  kg: { dimension: 'mass', toBase: 1000 },
  lb: { dimension: 'mass', toBase: 453.59237 }, // international avoirdupois pound (exact)
  oz: { dimension: 'mass', toBase: 28.349523125 }, // avoirdupois ounce (mass, not fluid)
  mL: { dimension: 'volume', toBase: 1 },
  L: { dimension: 'volume', toBase: 1000 },
  each: { dimension: 'count', toBase: 1 },
  dozen: { dimension: 'count', toBase: 12 },
};

export const DISPLAY_UNIT: Readonly<Record<Dimension, DisplayUnit>> = {
  mass: 'kg',
  volume: 'L',
  count: 'each',
};

/** Base units in one display unit (1 kg = 1000 g, 1 L = 1000 mL, 1 each = 1). */
export const BASE_PER_DISPLAY_UNIT: Readonly<Record<Dimension, number>> = {
  mass: 1000,
  volume: 1000,
  count: 1,
};

export type UnitErrorCode = 'UNKNOWN_UNIT' | 'DIMENSION_MISMATCH' | 'INVALID_QUANTITY';

export class UnitError extends Error {
  constructor(
    public readonly code: UnitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UnitError';
  }
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNITS, value);
}

export function unitDimension(unit: Unit): Dimension {
  return UNITS[unit].dimension;
}

/**
 * Converts a quantity to integer base units (g / mL / each).
 * Throws UnitError for unknown units, non-positive or non-finite quantities, dimension mismatches,
 * or quantities that round to zero base units. Never converts between volume and mass.
 */
export function toBase(quantity: number, unit: string, expected?: Dimension): number {
  if (!isUnit(unit)) {
    throw new UnitError('UNKNOWN_UNIT', `unsupported unit "${unit}"`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new UnitError('INVALID_QUANTITY', `quantity must be a positive number, got ${quantity}`);
  }
  const info = UNITS[unit];
  if (expected !== undefined && info.dimension !== expected) {
    throw new UnitError(
      'DIMENSION_MISMATCH',
      `cannot use ${info.dimension} unit "${unit}" for a ${expected} item`,
    );
  }
  const base = Math.round(quantity * info.toBase);
  if (base < 1) {
    throw new UnitError('INVALID_QUANTITY', `${quantity} ${unit} is below the smallest base unit`);
  }
  return base;
}

/**
 * Comparable unit price in cents per display unit ($/kg, $/L, $/each), rounded up.
 * `baseQuantity` is the amount (in base units) that `priceCents` buys.
 */
export function pricePerDisplayUnit(priceCents: Cents, baseQuantity: number, dimension: Dimension): Cents {
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    throw new UnitError('INVALID_QUANTITY', `base quantity must be positive, got ${baseQuantity}`);
  }
  return ceilCents((priceCents * BASE_PER_DISPLAY_UNIT[dimension]) / baseQuantity);
}
