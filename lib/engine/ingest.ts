import { ceilCents } from './money';
import { describeIssues, flyerListingSchema, flyerSchema, isoDateSchema, type ParsedFlyerListing } from './schemas';
import type { CatalogItem, IsoDate, NormalizedListing, RejectReason, Rejection } from './types';
import { BASE_PER_DISPLAY_UNIT, pricePerDisplayUnit, toBase, UNITS, UnitError } from './units';

/**
 * Flyer ingestion: date-window check, per-listing validation, normalization to base units.
 *
 * Rejections are collected, never thrown — one bad listing must not sink a flyer, and one bad
 * flyer must not sink the whole load.
 */

export type FlyerStatus = 'active' | 'expired' | 'not_yet_valid' | 'invalid';

export interface FlyerIngestResult {
  /** Store id from the flyer, or null when the envelope itself was unreadable. */
  storeId: string | null;
  status: FlyerStatus;
  listings: NormalizedListing[];
  rejections: Rejection[];
  warnings: string[];
}

export interface IngestResult {
  listings: NormalizedListing[];
  rejections: Rejection[];
  warnings: string[];
  flyers: { storeId: string | null; status: FlyerStatus }[];
}

/** Catalog lookup, built once per load. */
export type CatalogIndex = ReadonlyMap<string, CatalogItem>;

export function indexCatalog(items: readonly CatalogItem[]): CatalogIndex {
  return new Map(items.map((item) => [item.id, item]));
}

/** Inclusive date-window check on ISO dates (lexicographic order equals chronological order). */
export function flyerStatusOn(validFrom: IsoDate, validTo: IsoDate, asOf: IsoDate): 'active' | 'expired' | 'not_yet_valid' {
  if (asOf < validFrom) return 'not_yet_valid';
  if (asOf > validTo) return 'expired';
  return 'active';
}

class ListingRejected extends Error {
  constructor(
    public readonly reason: RejectReason,
    detail: string,
  ) {
    super(detail);
  }
}

/** True when a raw listing is a priced pack/per-unit entry that lacks the size or unit needed to compare it. */
function isMissingSize(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const pricing = (raw as { pricing?: unknown }).pricing;
  if (typeof pricing !== 'object' || pricing === null) return false;
  const p = pricing as { kind?: unknown; size?: unknown; unit?: unknown };
  if (p.kind === 'pack') return p.size == null || p.unit == null;
  if (p.kind === 'per_unit') return p.unit == null;
  return false;
}

function listingIdOf(raw: unknown, index: number): string {
  const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : undefined;
  return typeof id === 'string' && id.trim() !== '' ? id : `#${index}`;
}

function normalizeListing(
  listing: ParsedFlyerListing,
  storeId: string,
  catalog: CatalogIndex,
): NormalizedListing {
  const item = catalog.get(listing.catalogItemId);
  if (!item) {
    throw new ListingRejected('UNKNOWN_CATALOG_ITEM', `catalog item "${listing.catalogItemId}" does not exist`);
  }

  const { pricing } = listing;
  const unitDim = UNITS[pricing.unit].dimension;
  if (unitDim !== item.dimension) {
    throw new ListingRejected(
      'DIMENSION_MISMATCH',
      `unit "${pricing.unit}" is ${unitDim} but "${item.id}" is measured by ${item.dimension}`,
    );
  }

  if (listing.multiBuy) {
    if (pricing.kind !== 'pack') {
      throw new ListingRejected('INVALID_MULTIBUY', 'multi-buy deals are only supported on packaged items');
    }
    if (listing.multiBuy.quantity < 2) {
      throw new ListingRejected('INVALID_MULTIBUY', `multi-buy quantity must be at least 2, got ${listing.multiBuy.quantity}`);
    }
  }

  const common = {
    listingId: listing.id,
    storeId,
    catalogItemId: item.id,
    title: listing.title,
    ...(listing.brand !== undefined && { brand: listing.brand }),
    ...(listing.multiBuy !== undefined && { multiBuy: listing.multiBuy }),
    tags: [...new Set(listing.tags ?? [])],
    contains: [...new Set(listing.contains ?? [])],
  };

  try {
    if (pricing.kind === 'pack') {
      const packBase = toBase(pricing.size, pricing.unit, item.dimension);
      return {
        ...common,
        mode: 'pack',
        packBase,
        unitCents: pricing.priceCents,
        ...(listing.regularPriceCents !== undefined && { regularUnitCents: listing.regularPriceCents }),
        pricePerDisplayUnit: pricePerDisplayUnit(pricing.priceCents, packBase, item.dimension),
      };
    }

    // Loose (per-unit) pricing: rescale the rate to one display unit, e.g. $/lb → $/kg.
    const unitsPerDisplay = BASE_PER_DISPLAY_UNIT[item.dimension] / UNITS[pricing.unit].toBase;
    const unitCents = ceilCents(pricing.priceCents * unitsPerDisplay);
    return {
      ...common,
      mode: 'loose',
      unitCents,
      ...(listing.regularPriceCents !== undefined && {
        regularUnitCents: ceilCents(listing.regularPriceCents * unitsPerDisplay),
      }),
      pricePerDisplayUnit: unitCents,
    };
  } catch (e) {
    if (e instanceof UnitError) {
      throw new ListingRejected(e.code === 'DIMENSION_MISMATCH' ? 'DIMENSION_MISMATCH' : 'SCHEMA_INVALID', e.message);
    }
    throw e;
  }
}

/** Ingests one raw flyer as of a given date. */
export function ingestFlyer(raw: unknown, catalog: CatalogIndex, asOf: IsoDate): FlyerIngestResult {
  if (!isoDateSchema.safeParse(asOf).success) {
    throw new RangeError(`asOf must be an ISO date (YYYY-MM-DD), got "${asOf}"`);
  }

  const envelope = flyerSchema.safeParse(raw);
  if (!envelope.success) {
    const storeId =
      typeof raw === 'object' && raw !== null && typeof (raw as { storeId?: unknown }).storeId === 'string'
        ? (raw as { storeId: string }).storeId
        : null;
    return {
      storeId,
      status: 'invalid',
      listings: [],
      rejections: [],
      warnings: [`Flyer${storeId ? ` for store "${storeId}"` : ''} is invalid and was skipped: ${describeIssues(envelope.error)}`],
    };
  }

  const flyer = envelope.data;
  const status = flyerStatusOn(flyer.validFrom, flyer.validTo, asOf);
  if (status !== 'active') {
    const why = status === 'expired' ? `expired on ${flyer.validTo}` : `is not valid until ${flyer.validFrom}`;
    return {
      storeId: flyer.storeId,
      status,
      listings: [],
      rejections: [],
      warnings: [`Flyer for store "${flyer.storeId}" ${why} and was ignored.`],
    };
  }

  const listings: NormalizedListing[] = [];
  const rejections: Rejection[] = [];
  const seenIds = new Set<string>();

  flyer.listings.forEach((rawListing, index) => {
    const listingId = listingIdOf(rawListing, index);
    const reject = (reason: RejectReason, detail: string) =>
      rejections.push({ storeId: flyer.storeId, listingId, reason, detail });

    if (isMissingSize(rawListing)) {
      reject('MISSING_SIZE', 'listing has no pack size or unit, so its unit price cannot be compared');
      return;
    }

    const parsed = flyerListingSchema.safeParse(rawListing);
    if (!parsed.success) {
      reject('SCHEMA_INVALID', describeIssues(parsed.error));
      return;
    }

    if (seenIds.has(parsed.data.id)) {
      reject('SCHEMA_INVALID', `duplicate listing id "${parsed.data.id}" in this flyer`);
      return;
    }
    seenIds.add(parsed.data.id);

    try {
      listings.push(normalizeListing(parsed.data, flyer.storeId, catalog));
    } catch (e) {
      if (e instanceof ListingRejected) {
        reject(e.reason, e.message);
        return;
      }
      throw e;
    }
  });

  return { storeId: flyer.storeId, status, listings, rejections, warnings: [] };
}

/** Ingests many flyers and merges the results. Warns if a store has more than one active flyer. */
export function ingestFlyers(raws: readonly unknown[], catalog: CatalogIndex, asOf: IsoDate): IngestResult {
  const result: IngestResult = { listings: [], rejections: [], warnings: [], flyers: [] };
  const activeStores = new Set<string>();

  for (const raw of raws) {
    const one = ingestFlyer(raw, catalog, asOf);
    result.flyers.push({ storeId: one.storeId, status: one.status });
    result.warnings.push(...one.warnings);
    result.rejections.push(...one.rejections);

    if (one.status === 'active' && one.storeId !== null) {
      if (activeStores.has(one.storeId)) {
        result.warnings.push(`Store "${one.storeId}" has more than one active flyer; listings from all of them are used.`);
      }
      activeStores.add(one.storeId);
    }
    result.listings.push(...one.listings);
  }
  return result;
}
