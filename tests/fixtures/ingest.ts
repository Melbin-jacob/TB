import type { CatalogItem } from '@/lib/engine/types';

/** Small hand-made catalog for ingestion tests. */
export const CATALOG: CatalogItem[] = [
  { id: 'milk-2pct', name: 'Milk, 2%', dimension: 'volume', displayUnit: 'L', inherentContains: ['dairy'] },
  { id: 'yogurt-plain', name: 'Yogurt, plain', dimension: 'mass', displayUnit: 'kg', inherentContains: ['dairy'] },
  { id: 'apples-gala', name: 'Apples, Gala', dimension: 'mass', displayUnit: 'kg', inherentContains: [] },
  { id: 'eggs-large', name: 'Eggs, large', dimension: 'count', displayUnit: 'each', inherentContains: ['eggs'] },
  { id: 'cilantro', name: 'Cilantro, bunch', dimension: 'count', displayUnit: 'each', inherentContains: [] },
  { id: 'pasta-spaghetti', name: 'Pasta, spaghetti', dimension: 'mass', displayUnit: 'kg', inherentContains: ['gluten'] },
];

export const AS_OF = '2026-11-09';

/** A flyer mixing valid listings with one listing per rejection reason. */
export function mixedFlyer() {
  return {
    storeId: 'fresh-mart',
    validFrom: '2026-11-05',
    validTo: '2026-11-11',
    listings: [
      // --- valid ---------------------------------------------------------
      {
        id: 'fm-milk-4l',
        catalogItemId: 'milk-2pct',
        title: 'Dairyland 2% Milk 4 L',
        brand: 'Dairyland',
        pricing: { kind: 'pack', priceCents: 599, size: 4, unit: 'L' },
        regularPriceCents: 689,
        contains: ['dairy'],
      },
      {
        id: 'fm-yogurt-650',
        catalogItemId: 'yogurt-plain',
        title: 'Plain Yogurt 650 g',
        pricing: { kind: 'pack', priceCents: 449, size: 650, unit: 'g' },
        multiBuy: { quantity: 2, totalCents: 800 },
        tags: ['gluten-free', 'gluten-free'], // duplicate tag is de-duplicated
      },
      {
        id: 'fm-apples-lb',
        catalogItemId: 'apples-gala',
        title: 'Gala Apples',
        pricing: { kind: 'per_unit', priceCents: 199, unit: 'lb' },
        regularPriceCents: 249,
      },
      {
        id: 'fm-eggs-dozen',
        catalogItemId: 'eggs-large',
        title: 'Large Eggs, 1 dozen',
        pricing: { kind: 'pack', priceCents: 429, size: 1, unit: 'dozen' },
      },
      {
        id: 'fm-cilantro',
        catalogItemId: 'cilantro',
        title: 'Cilantro',
        pricing: { kind: 'per_unit', priceCents: 149, unit: 'each' },
      },
      // --- invalid -------------------------------------------------------
      {
        id: 'bad-no-size',
        catalogItemId: 'pasta-spaghetti',
        title: 'Spaghetti, family pack',
        pricing: { kind: 'pack', priceCents: 1299 },
      },
      {
        id: 'bad-unknown-item',
        catalogItemId: 'dragonfruit',
        title: 'Dragonfruit',
        pricing: { kind: 'per_unit', priceCents: 399, unit: 'each' },
      },
      {
        id: 'bad-volume-for-mass',
        catalogItemId: 'yogurt-plain',
        title: 'Drinkable Yogurt 1 L',
        pricing: { kind: 'pack', priceCents: 399, size: 1, unit: 'L' },
      },
      {
        id: 'bad-fl-oz',
        catalogItemId: 'milk-2pct',
        title: 'Milk 64 fl oz',
        pricing: { kind: 'pack', priceCents: 499, size: 64, unit: 'fl oz' },
      },
      {
        id: 'bad-multibuy-qty',
        catalogItemId: 'pasta-spaghetti',
        title: 'Spaghetti 900 g',
        pricing: { kind: 'pack', priceCents: 249, size: 900, unit: 'g' },
        multiBuy: { quantity: 1, totalCents: 200 },
      },
      {
        id: 'bad-multibuy-loose',
        catalogItemId: 'apples-gala',
        title: 'Gala Apples 2 for',
        pricing: { kind: 'per_unit', priceCents: 199, unit: 'lb' },
        multiBuy: { quantity: 2, totalCents: 300 },
      },
      {
        id: 'bad-float-price',
        catalogItemId: 'pasta-spaghetti',
        title: 'Spaghetti 450 g',
        pricing: { kind: 'pack', priceCents: 1.99, size: 450, unit: 'g' },
      },
      {
        id: 'bad-regular-below-sale',
        catalogItemId: 'pasta-spaghetti',
        title: 'Spaghetti 450 g',
        pricing: { kind: 'pack', priceCents: 199, size: 450, unit: 'g' },
        regularPriceCents: 150,
      },
      {
        id: 'bad-typo-key',
        catalogItemId: 'pasta-spaghetti',
        title: 'Spaghetti 450 g',
        pricing: { kind: 'pack', priceCents: 199, size: 450, unit: 'g' },
        regularPrice: 249,
      },
      {
        id: 'fm-milk-4l', // duplicate of the first listing
        catalogItemId: 'milk-2pct',
        title: 'Duplicate milk',
        pricing: { kind: 'pack', priceCents: 599, size: 4, unit: 'L' },
      },
      'not even an object',
    ],
  };
}
