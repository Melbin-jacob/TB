import type { Dimension, DisplayUnit, Unit } from '@/lib/engine/types';

/** Units offered in the list builder for each dimension (fluid ounces deliberately excluded). */
export const UNITS_FOR: Readonly<Record<Dimension, readonly Unit[]>> = {
  mass: ['kg', 'g', 'lb', 'oz'],
  volume: ['L', 'mL'],
  count: ['each', 'dozen'],
};

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** Human-readable amount from base units: 907 → "907 g", 1361 → "1.36 kg", 4000 mL → "4 L", 12 → "12". */
export function formatAmount(base: number, dimension: Dimension): string {
  if (dimension === 'count') return `${base}`;
  const [small, large] = dimension === 'mass' ? ['g', 'kg'] : ['mL', 'L'];
  return base < 1000 ? `${base} ${small}` : `${trim(base / 1000)} ${large}`;
}

/** Unit price label: "$1.50/L", "$4.39/kg", "$0.36 each". */
export function formatUnitPrice(cents: number, displayUnit: DisplayUnit): string {
  const price = `$${(cents / 100).toFixed(2)}`;
  return displayUnit === 'each' ? `${price} each` : `${price}/${displayUnit}`;
}

/** "Nov 9, 2026" from "2026-11-09" without time-zone drift. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
