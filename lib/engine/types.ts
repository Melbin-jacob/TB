/**
 * Shared data models for the grocery optimizer engine.
 * Types only — no runtime logic lives here.
 */

/** Physical dimension of a catalog item. Volume and mass are never converted into each other. */
export type Dimension = 'mass' | 'volume' | 'count';

/** Units accepted in flyers and user input. Fluid ounces are deliberately absent (US vs Imperial ambiguity). */
export type Unit = 'g' | 'kg' | 'lb' | 'oz' | 'mL' | 'L' | 'each' | 'dozen';

/** Canonical display unit per dimension, used for unit-price comparison ($/kg, $/L, $/each). */
export type DisplayUnit = 'kg' | 'L' | 'each';

export type Restriction =
  | 'vegan'
  | 'vegetarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free'
  | 'halal'
  | 'kosher';

export type Ingredient =
  | 'meat'
  | 'pork'
  | 'poultry'
  | 'fish'
  | 'shellfish'
  | 'dairy'
  | 'eggs'
  | 'honey'
  | 'gluten'
  | 'nuts'
  | 'alcohol';

/** Money is always an integer number of Canadian cents. */
export type Cents = number;

/** ISO calendar date, e.g. "2026-11-09". */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface CatalogItem {
  /** Stable slug, e.g. "milk-2pct". */
  id: string;
  /** Human-readable name, e.g. "Milk, 2%". */
  name: string;
  dimension: Dimension;
  displayUnit: DisplayUnit;
  /** Ingredients inherent to the item type (chicken → meat, poultry); drives catalog-level dietary warnings. */
  inherentContains: Ingredient[];
}

export interface Store {
  id: string;
  name: string;
  address: string;
  /** Forward sortation areas served, e.g. ["M5V", "M5J"]. */
  fsas: string[];
}

// ---------------------------------------------------------------------------
// Raw flyer data (validated at load time)
// ---------------------------------------------------------------------------

export type Pricing =
  /** A fixed package, e.g. "650 g for $4.49". */
  | { kind: 'pack'; priceCents: Cents; size: number; unit: Unit }
  /** Sold by weight/count in any amount, e.g. "$3.99/lb" or "$1.49 each". */
  | { kind: 'per_unit'; priceCents: Cents; unit: Unit };

export interface MultiBuy {
  /** Number of packs required for the deal (≥ 2). */
  quantity: number;
  /** Total price for `quantity` packs. */
  totalCents: Cents;
}

export interface FlyerListing {
  id: string;
  catalogItemId: string;
  title: string;
  brand?: string;
  pricing: Pricing;
  /** Regular (non-sale) price on the same basis as `pricing.priceCents`. */
  regularPriceCents?: Cents;
  multiBuy?: MultiBuy;
  /** Positive dietary claims. */
  tags?: Restriction[];
  /** Ingredients known to be present. */
  contains?: Ingredient[];
}

export interface Flyer {
  storeId: string;
  /** Inclusive start date. */
  validFrom: IsoDate;
  /** Inclusive end date. */
  validTo: IsoDate;
  listings: FlyerListing[];
}

// ---------------------------------------------------------------------------
// Normalized data (output of ingestion)
// ---------------------------------------------------------------------------

export interface NormalizedListing {
  listingId: string;
  storeId: string;
  catalogItemId: string;
  title: string;
  brand?: string;
  /** "pack" = whole packages only; "loose" = any amount at a per-unit rate. */
  mode: 'pack' | 'loose';
  /** Pack size in base units (g / mL / each). Present only in pack mode. */
  packBase?: number;
  /** Pack mode: price of one pack. Loose mode: price of one display unit (kg / L / each). */
  unitCents: Cents;
  /** Regular price on the same basis as `unitCents`. */
  regularUnitCents?: Cents;
  multiBuy?: MultiBuy;
  /** Comparable unit price in $/kg, $/L or $/each (rounded up to the cent). */
  pricePerDisplayUnit: Cents;
  tags: Restriction[];
  contains: Ingredient[];
}

export type RejectReason =
  | 'SCHEMA_INVALID'
  | 'UNKNOWN_CATALOG_ITEM'
  | 'DIMENSION_MISMATCH'
  | 'MISSING_SIZE'
  | 'INVALID_MULTIBUY';

export interface Rejection {
  storeId: string;
  listingId: string;
  reason: RejectReason;
  detail: string;
}

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

export interface ShoppingListItem {
  catalogItemId: string;
  quantity: number;
  unit: Unit;
}

export interface PlanRequest {
  postalCode: string;
  restrictions: Restriction[];
  items: ShoppingListItem[];
  /** Overrides "today" for flyer validity; intended for tests. */
  asOf?: IsoDate;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type DietaryStatus = 'ok' | 'unverified';

export interface PlanLine {
  catalogItemId: string;
  storeId: string;
  listingIds: string[];
  /** Packs bought per listing (loose listings report count 1). */
  packs: { listingId: string; count: number }[];
  costCents: Cents;
  regularCostCents?: Cents;
  dietary: DietaryStatus;
}

export interface Plan {
  /** One store (single-store plan) or two (two-store plan). */
  storeIds: string[];
  lines: PlanLine[];
  /** Catalog item ids that could not be purchased within this plan's stores. */
  unavailable: string[];
  totalCents: Cents;
  savingsVsRegularCents: Cents;
  complete: boolean;
  unverifiedCount: number;
  packCount: number;
}

export interface PlanResponse {
  /** Forward sortation area derived from the postal code, e.g. "M5V". */
  area: string;
  stores: Store[];
  bestSingle: Plan | null;
  bestPair: Plan | null;
  /** bestSingle.totalCents − bestPair.totalCents, when both exist. */
  pairSavingsCents: Cents | null;
  warnings: string[];
}
