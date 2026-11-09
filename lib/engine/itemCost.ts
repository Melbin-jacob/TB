import { ceilCents } from './money';
import type { Cents, DietaryStatus, Dimension, NormalizedListing } from './types';
import { BASE_PER_DISPLAY_UNIT } from './units';

/**
 * Cheapest way to buy at least `neededBase` base units (g / mL / each) of ONE catalog item at ONE store.
 *
 * Rules (agreed MVP requirements):
 * - Packs are bought whole; the shopper pays for every pack (leftover cost is not amortized).
 * - Pack sizes may be mixed (e.g. one 4 L jug + one 1 L carton).
 * - `unitCents` is the price of one pack bought on its own; a multi-buy is an extra option
 *   "N packs for totalCents". A bundle is used whenever it is cheapest, even if it over-buys.
 * - Loose (per-unit) listings can cover any amount and may top up a pack combination
 *   (e.g. one 3 lb bag + 0.64 kg loose).
 * - Ties: lower cost → fewer unverified packs → fewer packs → less over-buy.
 *
 * Algorithm: exact-reach min-cost DP ("unbounded knapsack") over pack options in units of
 * g = gcd(all option sizes), then for every reachable amount either it already covers the need
 * or the cheapest loose listing tops up the remainder.
 * Cost: O((needed + largest option) / g × options).
 */

export interface Candidate {
  listing: NormalizedListing;
  dietary: DietaryStatus;
}

export interface PackPurchase {
  listingId: string;
  /** Physical packs taken from this listing (bundles included). */
  packs: number;
  /** Number of multi-buy bundles among those packs. */
  bundles: number;
  costCents: Cents;
}

export interface LoosePurchase {
  listingId: string;
  /** Amount bought loose, in base units. */
  base: number;
  costCents: Cents;
}

export interface ItemPurchase {
  costCents: Cents;
  /** What the same purchase would cost at regular prices (sale price when no regular price is known). */
  regularCostCents: Cents;
  neededBase: number;
  purchasedBase: number;
  /** purchasedBase − neededBase (≥ 0). */
  overbuyBase: number;
  packs: PackPurchase[];
  loose?: LoosePurchase;
  /** Physical packs plus 1 for a loose portion. */
  packCount: number;
  /** "unverified" if any listing used is unverified. */
  dietary: DietaryStatus;
}

/** Safety cap on DP size; request validation keeps real inputs far below this. */
export const MAX_DP_CELLS = 500_000;

interface PackOption {
  listing: NormalizedListing;
  unverified: boolean;
  /** Size in DP units (base / g). */
  size: number;
  sizeBase: number;
  packs: number;
  bundle: boolean;
  costCents: Cents;
  regularCents: Cents;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Lexicographic comparison of (cost, unverified, packs, purchased). */
type Score = readonly [number, number, number, number];
function better(a: Score, b: Score): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}

export function cheapestPurchase(
  neededBase: number,
  candidates: readonly Candidate[],
  dimension: Dimension,
): ItemPurchase | null {
  if (!Number.isSafeInteger(neededBase) || neededBase < 1) {
    throw new RangeError(`neededBase must be a positive integer, got ${neededBase}`);
  }
  if (candidates.length === 0) return null;

  const first = candidates[0]!.listing;
  for (const { listing } of candidates) {
    if (listing.storeId !== first.storeId || listing.catalogItemId !== first.catalogItemId) {
      throw new Error('cheapestPurchase expects candidates for a single store and catalog item');
    }
  }

  const perDisplay = BASE_PER_DISPLAY_UNIT[dimension];

  // ---- options -------------------------------------------------------------
  const rawOptions: Omit<PackOption, 'size'>[] = [];
  let bestLoose: Candidate | undefined;

  for (const c of candidates) {
    const { listing } = c;
    const unverified = c.dietary === 'unverified';
    if (listing.mode === 'loose') {
      const isBetter =
        !bestLoose ||
        listing.unitCents < bestLoose.listing.unitCents ||
        (listing.unitCents === bestLoose.listing.unitCents && !unverified && bestLoose.dietary === 'unverified');
      if (isBetter) bestLoose = c;
      continue;
    }
    const packBase = listing.packBase;
    if (packBase === undefined || packBase < 1) continue; // ingestion guarantees this; defensive
    const regular = listing.regularUnitCents ?? listing.unitCents;
    rawOptions.push({
      listing,
      unverified,
      sizeBase: packBase,
      packs: 1,
      bundle: false,
      costCents: listing.unitCents,
      regularCents: regular,
    });
    if (listing.multiBuy) {
      const n = listing.multiBuy.quantity;
      rawOptions.push({
        listing,
        unverified,
        sizeBase: packBase * n,
        packs: n,
        bundle: true,
        costCents: listing.multiBuy.totalCents,
        regularCents: regular * n,
      });
    }
  }

  const looseCost = (base: number): Cents =>
    base <= 0 || !bestLoose ? 0 : ceilCents((base * bestLoose.listing.unitCents) / perDisplay);
  const looseRegular = (base: number): Cents =>
    base <= 0 || !bestLoose
      ? 0
      : ceilCents((base * (bestLoose.listing.regularUnitCents ?? bestLoose.listing.unitCents)) / perDisplay);

  // ---- DP over pack combinations ------------------------------------------
  const g = rawOptions.reduce((acc, o) => gcd(acc, o.sizeBase), 0) || 1;
  const options: PackOption[] = rawOptions.map((o) => ({ ...o, size: o.sizeBase / g }));
  const maxSize = options.reduce((m, o) => Math.max(m, o.size), 0);
  const target = Math.ceil(neededBase / g); // DP units that fully cover the need
  const cells = options.length > 0 ? target + maxSize : 1; // amounts beyond target−1+maxSize are never optimal
  if (cells > MAX_DP_CELLS) {
    throw new RangeError(`quantity too large to optimize (${cells} cells > ${MAX_DP_CELLS})`);
  }

  const cost = new Float64Array(cells).fill(Infinity);
  const unv = new Int32Array(cells);
  const packs = new Int32Array(cells);
  const choice = new Int32Array(cells).fill(-1);
  cost[0] = 0;

  for (let q = 1; q < cells; q++) {
    for (let k = 0; k < options.length; k++) {
      const o = options[k]!;
      const prev = q - o.size;
      if (prev < 0 || cost[prev] === Infinity) continue;
      const cand: Score = [cost[prev]! + o.costCents, unv[prev]! + (o.unverified ? o.packs : 0), packs[prev]! + o.packs, 0];
      const cur: Score = [cost[q]!, unv[q]!, packs[q]!, 0];
      if (choice[q] === -1 || better(cand, cur)) {
        cost[q] = cand[0];
        unv[q] = cand[1];
        packs[q] = cand[2];
        choice[q] = k;
      }
    }
  }

  // ---- pick the best end state ----------------------------------------------
  let best: { q: number; looseBase: number; score: Score } | undefined;
  const looseUnverified = bestLoose?.dietary === 'unverified' ? 1 : 0;

  for (let q = 0; q < cells; q++) {
    if (cost[q] === Infinity) continue;
    const coveredBase = q * g;
    const remainder = neededBase - coveredBase;
    if (remainder > 0 && !bestLoose) continue;
    const looseBase = Math.max(0, remainder);
    const score: Score = [
      cost[q]! + looseCost(looseBase),
      unv[q]! + (looseBase > 0 ? looseUnverified : 0),
      packs[q]! + (looseBase > 0 ? 1 : 0),
      coveredBase + looseBase,
    ];
    if (!best || better(score, best.score)) best = { q, looseBase, score };
  }
  if (!best) return null;

  // ---- reconstruct ------------------------------------------------------------
  const byListing = new Map<string, PackPurchase>();
  let regularCostCents = 0;
  let anyUnverified = false;
  for (let q = best.q; q > 0; ) {
    const o = options[choice[q]!]!;
    const entry = byListing.get(o.listing.listingId) ?? { listingId: o.listing.listingId, packs: 0, bundles: 0, costCents: 0 };
    entry.packs += o.packs;
    entry.bundles += o.bundle ? 1 : 0;
    entry.costCents += o.costCents;
    byListing.set(o.listing.listingId, entry);
    regularCostCents += o.regularCents;
    anyUnverified ||= o.unverified;
    q -= o.size;
  }

  let loose: LoosePurchase | undefined;
  if (best.looseBase > 0 && bestLoose) {
    loose = { listingId: bestLoose.listing.listingId, base: best.looseBase, costCents: looseCost(best.looseBase) };
    regularCostCents += looseRegular(best.looseBase);
    anyUnverified ||= bestLoose.dietary === 'unverified';
  }

  const [costCents, , packCount, purchasedBase] = best.score;
  return {
    costCents,
    regularCostCents,
    neededBase,
    purchasedBase,
    overbuyBase: purchasedBase - neededBase,
    packs: [...byListing.values()].sort((a, b) => a.listingId.localeCompare(b.listingId)),
    ...(loose && { loose }),
    packCount,
    dietary: anyUnverified ? 'unverified' : 'ok',
  };
}
