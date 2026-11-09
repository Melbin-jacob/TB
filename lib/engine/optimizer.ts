import { cheapestPurchase, type Candidate, type ItemPurchase } from './itemCost';
import type { Dimension, Plan, PlanLine } from './types';

/**
 * Single-store vs two-store optimization over a precomputed cost table.
 *
 * 1. Cost table: cheapest purchase for every (store, list item) — S × I solver calls, done once.
 * 2. Single store: sum one row per store                          — O(S · I).
 * 3. Two stores: each item goes to the cheaper store of the pair   — O(S² · I).
 * 4. Ranking (deterministic): complete first → more items covered → lower total
 *    → fewer unverified lines → fewer packs → store ids alphabetically.
 */

export interface ListLine {
  catalogItemId: string;
  dimension: Dimension;
  neededBase: number;
}

/** costTable.get(storeId)[lineIndex] → purchase, or null when the store cannot supply that line. */
export type CostTable = ReadonlyMap<string, readonly (ItemPurchase | null)[]>;

/**
 * Builds the cost table.
 * `candidatesFor(storeId, catalogItemId)` returns that store's eligible listings for the item.
 */
export function buildCostTable(
  storeIds: readonly string[],
  lines: readonly ListLine[],
  candidatesFor: (storeId: string, catalogItemId: string) => readonly Candidate[],
): CostTable {
  const table = new Map<string, (ItemPurchase | null)[]>();
  for (const storeId of storeIds) {
    table.set(
      storeId,
      lines.map((line) => cheapestPurchase(line.neededBase, candidatesFor(storeId, line.catalogItemId), line.dimension)),
    );
  }
  return table;
}

function toPlanLine(line: ListLine, storeId: string, p: ItemPurchase): PlanLine {
  const listingIds = p.packs.map((x) => x.listingId);
  if (p.loose && !listingIds.includes(p.loose.listingId)) listingIds.push(p.loose.listingId);
  return {
    catalogItemId: line.catalogItemId,
    storeId,
    listingIds,
    packs: p.packs.map((x) => ({ listingId: x.listingId, count: x.packs, bundles: x.bundles })),
    ...(p.loose && { loose: { listingId: p.loose.listingId, base: p.loose.base } }),
    neededBase: p.neededBase,
    purchasedBase: p.purchasedBase,
    costCents: p.costCents,
    regularCostCents: p.regularCostCents,
    dietary: p.dietary,
  };
}

/** Item-level preference inside a pair: cheaper → ok over unverified → fewer packs → (caller order). */
function preferA(a: ItemPurchase, b: ItemPurchase): boolean {
  if (a.costCents !== b.costCents) return a.costCents < b.costCents;
  if (a.dietary !== b.dietary) return a.dietary === 'ok';
  return a.packCount <= b.packCount;
}

/**
 * Builds the plan for a set of 1 or 2 stores: each line is bought at whichever store is best for it.
 * `storeIds` order breaks exact ties (pass them sorted for determinism).
 */
export function planForStores(storeIds: readonly string[], lines: readonly ListLine[], table: CostTable): Plan {
  const planLines: PlanLine[] = [];
  const unavailable: string[] = [];
  let totalCents = 0;
  let savings = 0;
  let unverifiedCount = 0;
  let packCount = 0;

  lines.forEach((line, i) => {
    let bestStore: string | undefined;
    let best: ItemPurchase | null = null;
    for (const storeId of storeIds) {
      const p = table.get(storeId)?.[i] ?? null;
      if (p && (!best || !preferA(best, p))) {
        best = p;
        bestStore = storeId;
      }
    }
    if (!best || bestStore === undefined) {
      unavailable.push(line.catalogItemId);
      return;
    }
    planLines.push(toPlanLine(line, bestStore, best));
    totalCents += best.costCents;
    savings += best.regularCostCents - best.costCents;
    if (best.dietary === 'unverified') unverifiedCount += 1;
    packCount += best.packCount;
  });

  return {
    storeIds: [...storeIds],
    lines: planLines,
    unavailable,
    totalCents,
    savingsVsRegularCents: savings,
    complete: unavailable.length === 0,
    unverifiedCount,
    packCount,
  };
}

/** Negative when `a` ranks before `b`. */
export function comparePlans(a: Plan, b: Plan): number {
  if (a.complete !== b.complete) return a.complete ? -1 : 1;
  if (a.lines.length !== b.lines.length) return b.lines.length - a.lines.length;
  if (a.totalCents !== b.totalCents) return a.totalCents - b.totalCents;
  if (a.unverifiedCount !== b.unverifiedCount) return a.unverifiedCount - b.unverifiedCount;
  if (a.packCount !== b.packCount) return a.packCount - b.packCount;
  return a.storeIds.join(',').localeCompare(b.storeIds.join(','));
}

export interface OptimizationResult {
  bestSingle: Plan | null;
  /** Best plan that genuinely uses two stores; null if fewer than 2 stores or no pair splits the list. */
  bestPair: Plan | null;
  /** True when ≥ 2 stores exist but every pair would buy everything at one store. */
  pairNeverSplits: boolean;
}

export function optimize(storeIds: readonly string[], lines: readonly ListLine[], table: CostTable): OptimizationResult {
  const sorted = [...storeIds].sort();

  let bestSingle: Plan | null = null;
  for (const id of sorted) {
    const plan = planForStores([id], lines, table);
    if (!bestSingle || comparePlans(plan, bestSingle) < 0) bestSingle = plan;
  }

  let bestPair: Plan | null = null;
  for (let a = 0; a < sorted.length; a++) {
    for (let b = a + 1; b < sorted.length; b++) {
      const plan = planForStores([sorted[a]!, sorted[b]!], lines, table);
      const used = new Set(plan.lines.map((l) => l.storeId));
      if (used.size < 2) continue; // degenerate: identical to a single-store plan
      if (!bestPair || comparePlans(plan, bestPair) < 0) bestPair = plan;
    }
  }

  return { bestSingle, bestPair, pairNeverSplits: sorted.length >= 2 && bestPair === null };
}
