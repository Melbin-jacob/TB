import { catalogConflicts, filterListings } from './dietary';
import type { CatalogIndex, FlyerStatus } from './ingest';
import type { Candidate } from './itemCost';
import { buildCostTable, optimize, type ListLine } from './optimizer';
import { parsePostalCode } from './postal';
import type { Dimension, NormalizedListing, PlanRequest, PlanResponse, Store } from './types';
import { DISPLAY_UNIT, toBase, UnitError } from './units';

/**
 * planShopping(): the engine's single entry point.
 * Pure — the caller supplies already-loaded data (see lib/data/loader.ts), already filtered by date.
 */

export const MAX_LIST_LINES = 50;

/** Largest amount per list line, in base units: 25 kg, 25 L, 200 each. */
export const MAX_LINE_BASE: Readonly<Record<Dimension, number>> = {
  mass: 25_000,
  volume: 25_000,
  count: 200,
};

export interface PlanningData {
  catalogIndex: CatalogIndex;
  stores: readonly Store[];
  /** Normalized listings from currently active flyers. */
  listings: readonly NormalizedListing[];
  /** Flyer outcomes, used to warn about stores without a current flyer. */
  flyers?: readonly { storeId: string | null; status: FlyerStatus }[];
}

export type PlanInputIssueCode =
  | 'INVALID_POSTAL_CODE'
  | 'EMPTY_LIST'
  | 'TOO_MANY_ITEMS'
  | 'UNKNOWN_ITEM'
  | 'INVALID_QUANTITY'
  | 'DIMENSION_MISMATCH'
  | 'QUANTITY_TOO_LARGE';

export interface PlanInputIssue {
  code: PlanInputIssueCode;
  message: string;
  /** Index into request.items, when the issue concerns one line. */
  itemIndex?: number;
}

export class PlanInputError extends Error {
  constructor(public readonly issues: PlanInputIssue[]) {
    super(issues.map((i) => i.message).join(' '));
    this.name = 'PlanInputError';
  }
}

function formatLimit(dimension: Dimension): string {
  const max = MAX_LINE_BASE[dimension];
  return dimension === 'count' ? `${max} each` : `${max / 1000} ${DISPLAY_UNIT[dimension]}`;
}

/** Validates the list, converts quantities to base units, and merges repeated items. */
function toListLines(request: Pick<PlanRequest, 'items'>, catalog: CatalogIndex): ListLine[] {
  const issues: PlanInputIssue[] = [];
  if (request.items.length === 0) {
    issues.push({ code: 'EMPTY_LIST', message: 'Add at least one item to your list.' });
  }
  if (request.items.length > MAX_LIST_LINES) {
    issues.push({ code: 'TOO_MANY_ITEMS', message: `A list can have at most ${MAX_LIST_LINES} items.` });
  }

  const merged = new Map<string, ListLine>();
  request.items.forEach((item, itemIndex) => {
    const catalogItem = catalog.get(item.catalogItemId);
    if (!catalogItem) {
      issues.push({ code: 'UNKNOWN_ITEM', message: `Unknown item "${item.catalogItemId}".`, itemIndex });
      return;
    }
    let base: number;
    try {
      base = toBase(item.quantity, item.unit, catalogItem.dimension);
    } catch (e) {
      if (!(e instanceof UnitError)) throw e;
      const code = e.code === 'DIMENSION_MISMATCH' ? 'DIMENSION_MISMATCH' : 'INVALID_QUANTITY';
      issues.push({ code, message: `${catalogItem.name}: ${e.message}.`, itemIndex });
      return;
    }
    const existing = merged.get(catalogItem.id);
    const total = (existing?.neededBase ?? 0) + base;
    if (total > MAX_LINE_BASE[catalogItem.dimension]) {
      issues.push({
        code: 'QUANTITY_TOO_LARGE',
        message: `${catalogItem.name}: at most ${formatLimit(catalogItem.dimension)} per item.`,
        itemIndex,
      });
      return;
    }
    merged.set(catalogItem.id, { catalogItemId: catalogItem.id, dimension: catalogItem.dimension, neededBase: total });
  });

  if (issues.length > 0) throw new PlanInputError(issues);
  return [...merged.values()];
}

export function planShopping(request: Omit<PlanRequest, 'asOf'>, data: PlanningData): PlanResponse {
  const postal = parsePostalCode(request.postalCode);
  if (!postal.ok) {
    throw new PlanInputError([{ code: 'INVALID_POSTAL_CODE', message: postal.error }]);
  }
  const lines = toListLines(request, data.catalogIndex);
  const restrictions = [...new Set(request.restrictions)];

  const stores = data.stores.filter((s) => s.fsas.includes(postal.fsa)).sort((a, b) => a.id.localeCompare(b.id));
  const empty: PlanResponse = {
    area: postal.fsa,
    stores,
    bestSingle: null,
    bestPair: null,
    pairSavingsCents: null,
    warnings: [],
    listings: [],
  };
  if (stores.length === 0) {
    return { ...empty, warnings: [`No stores in our coverage area yet for ${postal.fsa}.`] };
  }

  const warnings: string[] = [];
  const storeIds = new Set(stores.map((s) => s.id));
  const wanted = new Set(lines.map((l) => l.catalogItemId));

  // Stores in the area without a current flyer.
  if (data.flyers) {
    const active = new Set(data.flyers.filter((f) => f.status === 'active').map((f) => f.storeId));
    for (const s of stores) {
      if (!active.has(s.id)) warnings.push(`${s.name} has no current flyer; its prices are not included.`);
    }
  }

  // Catalog-level dietary conflicts.
  const listItems = lines.map((l) => data.catalogIndex.get(l.catalogItemId)!);
  warnings.push(...catalogConflicts(listItems, restrictions).map((c) => c.message));

  // Eligible listings, indexed by store and item.
  const relevant = data.listings.filter((l) => storeIds.has(l.storeId) && wanted.has(l.catalogItemId));
  const { eligible } = filterListings(relevant, data.catalogIndex, restrictions);
  const byStoreItem = new Map<string, Candidate[]>();
  for (const c of eligible) {
    const key = `${c.listing.storeId}\u0000${c.listing.catalogItemId}`;
    const bucket = byStoreItem.get(key);
    if (bucket) bucket.push(c);
    else byStoreItem.set(key, [c]);
  }

  const table = buildCostTable(
    stores.map((s) => s.id),
    lines,
    (storeId, itemId) => byStoreItem.get(`${storeId}\u0000${itemId}`) ?? [],
  );
  const { bestSingle, bestPair, pairNeverSplits } = optimize(
    stores.map((s) => s.id),
    lines,
    table,
  );

  if (stores.length === 1) {
    warnings.push(`Only one store serves ${postal.fsa}, so there is no two-store option.`);
  } else if (pairNeverSplits) {
    warnings.push('A second store would not lower the cost of this list.');
  }

  const nowhere = lines.filter((_, i) => stores.every((s) => table.get(s.id)?.[i] == null));
  for (const line of nowhere) {
    const name = data.catalogIndex.get(line.catalogItemId)?.name ?? line.catalogItemId;
    warnings.push(`${name} is not available at any store near you this week${restrictions.length ? ' that fits your dietary needs' : ''}.`);
  }

  const sameCoverage =
    bestSingle !== null &&
    bestPair !== null &&
    bestSingle.unavailable.length === bestPair.unavailable.length &&
    bestSingle.unavailable.every((id) => bestPair.unavailable.includes(id));

  const usedIds = new Set([...(bestSingle?.lines ?? []), ...(bestPair?.lines ?? [])].flatMap((l) => l.listingIds));
  const listings = relevant.filter((l) => usedIds.has(l.listingId));

  return {
    ...empty,
    bestSingle,
    bestPair,
    pairSavingsCents: sameCoverage ? bestSingle.totalCents - bestPair.totalCents : null,
    warnings,
    listings,
  };
}
