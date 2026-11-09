import { z } from 'zod';
import type { Dimension, Ingredient, Restriction, Unit } from './types';
import { DISPLAY_UNIT } from './units';

/**
 * Zod schemas for reference data (catalog, stores) and raw flyers.
 *
 * Flyer listings are validated one at a time by `ingest.ts`, so the flyer envelope keeps
 * `listings` as `unknown[]` — a single bad listing must never sink a whole flyer.
 */

// ---------------------------------------------------------------------------
// Enumerations (kept in lock-step with the union types in types.ts)
// ---------------------------------------------------------------------------

export const DIMENSIONS = ['mass', 'volume', 'count'] as const satisfies readonly Dimension[];

export const UNIT_VALUES = ['g', 'kg', 'lb', 'oz', 'mL', 'L', 'each', 'dozen'] as const satisfies readonly Unit[];

export const RESTRICTIONS = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'halal',
  'kosher',
] as const satisfies readonly Restriction[];

export const INGREDIENTS = [
  'meat',
  'pork',
  'poultry',
  'fish',
  'shellfish',
  'dairy',
  'eggs',
  'honey',
  'gluten',
  'nuts',
  'alcohol',
] as const satisfies readonly Ingredient[];

// Compile-time guard: every member of each union must appear in its runtime list.
type MissingFrom<TUnion, TList extends readonly unknown[]> = Exclude<TUnion, TList[number]>;
const _exhaustive: [
  MissingFrom<Dimension, typeof DIMENSIONS>,
  MissingFrom<Unit, typeof UNIT_VALUES>,
  MissingFrom<Restriction, typeof RESTRICTIONS>,
  MissingFrom<Ingredient, typeof INGREDIENTS>,
] = [] as unknown as [never, never, never, never];
void _exhaustive;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase slug, e.g. "milk-2pct"');
const nonEmpty = z.string().trim().min(1);
/** Prices must be positive whole cents. */
const cents = z.number().int().positive();
const fsa = z.string().regex(/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/, 'must be a forward sortation area, e.g. "M5V"');

export const isoDateSchema = z.iso.date();

/** Rejects arrays whose items share an `id`. */
function uniqueIds<T extends { id: string }>(items: T[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: 'custom', message: `duplicate id "${item.id}"`, path: [index, 'id'] });
    }
    seen.add(item.id);
  });
}

// ---------------------------------------------------------------------------
// Catalog & stores
// ---------------------------------------------------------------------------

export const catalogItemSchema = z
  .strictObject({
    id: slug,
    name: nonEmpty,
    dimension: z.enum(DIMENSIONS),
    displayUnit: z.enum(['kg', 'L', 'each']),
    inherentContains: z.array(z.enum(INGREDIENTS)).default([]),
  })
  .refine((item) => item.displayUnit === DISPLAY_UNIT[item.dimension], {
    message: 'displayUnit must match dimension (mass → kg, volume → L, count → each)',
    path: ['displayUnit'],
  });

export const catalogSchema = z.array(catalogItemSchema).min(1).superRefine(uniqueIds);

export const storeSchema = z.strictObject({
  id: slug,
  name: nonEmpty,
  address: nonEmpty,
  fsas: z.array(fsa).min(1),
});

export const storesSchema = z.array(storeSchema).min(1).superRefine(uniqueIds);

// ---------------------------------------------------------------------------
// Flyers
// ---------------------------------------------------------------------------

export const pricingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pack'),
    priceCents: cents,
    size: z.number().positive().finite(),
    unit: z.enum(UNIT_VALUES),
  }),
  z.strictObject({
    kind: z.literal('per_unit'),
    priceCents: cents,
    unit: z.enum(UNIT_VALUES),
  }),
]);

export const multiBuySchema = z.strictObject({
  quantity: z.number().int(),
  totalCents: cents,
});

export const flyerListingSchema = z
  .strictObject({
    id: nonEmpty,
    catalogItemId: slug,
    title: nonEmpty,
    brand: nonEmpty.optional(),
    pricing: pricingSchema,
    regularPriceCents: cents.optional(),
    multiBuy: multiBuySchema.optional(),
    tags: z.array(z.enum(RESTRICTIONS)).optional(),
    contains: z.array(z.enum(INGREDIENTS)).optional(),
  })
  .refine((l) => l.regularPriceCents === undefined || l.regularPriceCents >= l.pricing.priceCents, {
    message: 'regularPriceCents must not be lower than the sale price',
    path: ['regularPriceCents'],
  });

/** Flyer envelope. Listings stay unvalidated here; see ingest.ts. */
export const flyerSchema = z
  .strictObject({
    storeId: slug,
    validFrom: isoDateSchema,
    validTo: isoDateSchema,
    listings: z.array(z.unknown()),
  })
  .refine((f) => f.validFrom <= f.validTo, {
    message: 'validFrom must be on or before validTo',
    path: ['validTo'],
  });

export type ParsedFlyerListing = z.infer<typeof flyerListingSchema>;
export type ParsedFlyer = z.infer<typeof flyerSchema>;

/** One-line, path-prefixed summary of Zod issues for logs and rejection details. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}
