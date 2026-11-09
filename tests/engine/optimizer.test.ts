import { describe, expect, it } from 'vitest';
import { loadMarketData } from '@/lib/data/loader';
import { MAX_LIST_LINES, planShopping, PlanInputError, type PlanningData } from '@/lib/engine/index';
import { indexCatalog } from '@/lib/engine/ingest';
import type { ItemPurchase } from '@/lib/engine/itemCost';
import { comparePlans, optimize, planForStores, type CostTable, type ListLine } from '@/lib/engine/optimizer';
import type { CatalogItem, NormalizedListing, Plan, PlanRequest, Store } from '@/lib/engine/types';

// ---------------------------------------------------------------------------
// optimizer.ts with a hand-built cost table
// ---------------------------------------------------------------------------

function buy(costCents: number, extra: Partial<ItemPurchase> = {}): ItemPurchase {
  return {
    costCents,
    regularCostCents: costCents,
    neededBase: 1000,
    purchasedBase: 1000,
    overbuyBase: 0,
    packs: [{ listingId: `l${costCents}`, packs: 1, bundles: 0, costCents }],
    packCount: 1,
    dietary: 'ok',
    ...extra,
  };
}

const LINES: ListLine[] = ['milk', 'eggs', 'rice'].map((id) => ({ catalogItemId: id, dimension: 'mass', neededBase: 1000 }));
const table = (rows: Record<string, (ItemPurchase | null)[]>): CostTable => new Map(Object.entries(rows));

describe('planForStores', () => {
  it('sums one store and lists what it cannot supply', () => {
    const plan = planForStores(['a'], LINES, table({ a: [buy(100), null, buy(300, { regularCostCents: 350 })] }));
    expect(plan).toMatchObject({
      storeIds: ['a'],
      totalCents: 400,
      savingsVsRegularCents: 50,
      unavailable: ['eggs'],
      complete: false,
      packCount: 2,
    });
  });

  it('sends each item to the cheaper store of a pair', () => {
    const plan = planForStores(['a', 'b'], LINES, table({ a: [buy(100), buy(500), buy(300)], b: [buy(200), buy(400), buy(300)] }));
    expect(plan.lines.map((l) => [l.catalogItemId, l.storeId])).toEqual([
      ['milk', 'a'],
      ['eggs', 'b'],
      ['rice', 'a'], // exact tie → first store
    ]);
    expect(plan.totalCents).toBe(800);
  });

  it('prefers the ok listing over an equally priced unverified one', () => {
    const plan = planForStores(['a', 'b'], LINES.slice(0, 1), table({ a: [buy(100, { dietary: 'unverified' })], b: [buy(100)] }));
    expect(plan.lines[0]?.storeId).toBe('b');
    expect(plan.unverifiedCount).toBe(0);
  });
});

describe('comparePlans / optimize', () => {
  const plan = (p: Partial<Plan>): Plan => ({
    storeIds: ['x'],
    lines: [],
    unavailable: [],
    totalCents: 0,
    savingsVsRegularCents: 0,
    complete: true,
    unverifiedCount: 0,
    packCount: 0,
    ...p,
  });

  it('ranks complete before incomplete regardless of price', () => {
    expect(comparePlans(plan({ totalCents: 900 }), plan({ totalCents: 100, complete: false }))).toBeLessThan(0);
  });

  it('ranks incomplete plans by coverage, then price, then unverified, packs, store ids', () => {
    const line = { catalogItemId: 'x' } as Plan['lines'][number];
    expect(comparePlans(plan({ complete: false, lines: [line, line], totalCents: 900 }), plan({ complete: false, lines: [line], totalCents: 1 }))).toBeLessThan(0);
    expect(comparePlans(plan({ totalCents: 100 }), plan({ totalCents: 200 }))).toBeLessThan(0);
    expect(comparePlans(plan({ unverifiedCount: 0 }), plan({ unverifiedCount: 1 }))).toBeLessThan(0);
    expect(comparePlans(plan({ packCount: 1 }), plan({ packCount: 2 }))).toBeLessThan(0);
    expect(comparePlans(plan({ storeIds: ['a'] }), plan({ storeIds: ['b'] }))).toBeLessThan(0);
  });

  it('finds the best single store and the best genuine pair', () => {
    const t = table({
      a: [buy(100), buy(500), buy(300)], // 900
      b: [buy(200), buy(400), buy(250)], // 850 ← best single
      c: [buy(150), buy(450), buy(400)], // 1000
    });
    const r = optimize(['c', 'b', 'a'], LINES, t);
    expect(r.bestSingle?.storeIds).toEqual(['b']);
    expect(r.bestSingle?.totalCents).toBe(850);
    expect(r.bestPair?.storeIds).toEqual(['a', 'b']); // milk@a 100 + eggs@b 400 + rice@b 250 = 750
    expect(r.bestPair?.totalCents).toBe(750);
    expect(r.pairNeverSplits).toBe(false);
  });

  it('prefers a complete single store over a cheaper incomplete one', () => {
    const r = optimize(['a', 'b'], LINES, table({ a: [buy(100), null, buy(100)], b: [buy(500), buy(500), buy(500)] }));
    expect(r.bestSingle?.storeIds).toEqual(['b']);
  });

  it('skips pairs that would buy everything at one store', () => {
    const r = optimize(['a', 'b'], LINES, table({ a: [buy(100), buy(100), buy(100)], b: [buy(200), buy(200), buy(200)] }));
    expect(r.bestPair).toBeNull();
    expect(r.pairNeverSplits).toBe(true);
  });

  it('has no pair with a single store', () => {
    const r = optimize(['a'], LINES, table({ a: [buy(1), buy(1), buy(1)] }));
    expect(r).toMatchObject({ bestPair: null, pairNeverSplits: false });
  });

  it('lets a pair complete a list no single store can', () => {
    const r = optimize(['a', 'b'], LINES, table({ a: [buy(100), null, buy(100)], b: [null, buy(100), null] }));
    expect(r.bestSingle?.complete).toBe(false);
    expect(r.bestPair?.complete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// planShopping with small hand-made data
// ---------------------------------------------------------------------------

const CATALOG: CatalogItem[] = [
  { id: 'milk', name: 'Milk, 2%', dimension: 'volume', displayUnit: 'L', inherentContains: ['dairy'] },
  { id: 'chicken', name: 'Chicken thighs', dimension: 'mass', displayUnit: 'kg', inherentContains: ['meat', 'poultry'] },
  { id: 'rice', name: 'Rice', dimension: 'mass', displayUnit: 'kg', inherentContains: [] },
  { id: 'flour', name: 'Flour', dimension: 'mass', displayUnit: 'kg', inherentContains: ['gluten'] },
];
const STORES: Store[] = [
  { id: 'alpha', name: 'Alpha', address: '1 A St', fsas: ['M5V'] },
  { id: 'beta', name: 'Beta', address: '2 B St', fsas: ['M5V', 'M6K'] },
  { id: 'gamma', name: 'Gamma', address: '3 C St', fsas: ['K1A'] },
];
function L(id: string, storeId: string, catalogItemId: string, packBase: number, unitCents: number, extra: Partial<NormalizedListing> = {}): NormalizedListing {
  return { listingId: id, storeId, catalogItemId, title: id, mode: 'pack', packBase, unitCents, pricePerDisplayUnit: 0, tags: [], contains: [], ...extra };
}
const DATA: PlanningData = {
  catalogIndex: indexCatalog(CATALOG),
  stores: STORES,
  listings: [
    L('a-milk', 'alpha', 'milk', 4000, 500, { regularUnitCents: 600 }),
    L('a-chicken', 'alpha', 'chicken', 1000, 1200),
    L('a-rice', 'alpha', 'rice', 2000, 900),
    L('b-milk', 'beta', 'milk', 4000, 600),
    L('b-chicken', 'beta', 'chicken', 1000, 900),
    L('b-rice', 'beta', 'rice', 2000, 700, { tags: ['vegan'] }),
    L('g-milk', 'gamma', 'milk', 1000, 100),
  ],
  flyers: [
    { storeId: 'alpha', status: 'active' },
    { storeId: 'beta', status: 'active' },
  ],
};

const req = (items: PlanRequest['items'], extra: Partial<PlanRequest> = {}) => ({ postalCode: 'M5V 2T6', restrictions: [], items, ...extra });
function issuesOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof PlanInputError) return e.issues.map((i) => i.code);
    throw e;
  }
  return [];
}

describe('planShopping — input validation', () => {
  it('rejects an invalid postal code', () => {
    expect(issuesOf(() => planShopping(req([{ catalogItemId: 'milk', quantity: 1, unit: 'L' }], { postalCode: '90210' }), DATA))).toEqual([
      'INVALID_POSTAL_CODE',
    ]);
  });

  it('rejects an empty list and an over-long list', () => {
    expect(issuesOf(() => planShopping(req([]), DATA))).toEqual(['EMPTY_LIST']);
    const many = Array.from({ length: MAX_LIST_LINES + 1 }, () => ({ catalogItemId: 'rice', quantity: 1, unit: 'g' as const }));
    expect(issuesOf(() => planShopping(req(many), DATA))).toContain('TOO_MANY_ITEMS');
  });

  it('reports every bad line at once, with its index', () => {
    let error: PlanInputError | undefined;
    try {
      planShopping(
        req([
          { catalogItemId: 'unicorn', quantity: 1, unit: 'kg' },
          { catalogItemId: 'chicken', quantity: 1, unit: 'L' },
          { catalogItemId: 'rice', quantity: 0, unit: 'kg' },
          { catalogItemId: 'rice', quantity: 30, unit: 'kg' },
        ]),
        DATA,
      );
    } catch (e) {
      error = e as PlanInputError;
    }
    expect(error?.issues.map((i) => [i.code, i.itemIndex])).toEqual([
      ['UNKNOWN_ITEM', 0],
      ['DIMENSION_MISMATCH', 1],
      ['INVALID_QUANTITY', 2],
      ['QUANTITY_TOO_LARGE', 3],
    ]);
  });

  it('merges repeated items and applies the limit to the total', () => {
    const r = planShopping(req([{ catalogItemId: 'rice', quantity: 1, unit: 'kg' }, { catalogItemId: 'rice', quantity: 500, unit: 'g' }]), DATA);
    expect(r.bestSingle?.lines).toHaveLength(1);
    expect(r.bestSingle?.lines[0]?.neededBase).toBe(1500);
    expect(
      issuesOf(() => planShopping(req([{ catalogItemId: 'rice', quantity: 20, unit: 'kg' }, { catalogItemId: 'rice', quantity: 6, unit: 'kg' }]), DATA)),
    ).toEqual(['QUANTITY_TOO_LARGE']);
  });
});

describe('planShopping — results', () => {
  const list = req([
    { catalogItemId: 'milk', quantity: 4, unit: 'L' },
    { catalogItemId: 'chicken', quantity: 1, unit: 'kg' },
    { catalogItemId: 'rice', quantity: 2, unit: 'kg' },
  ]);

  it('returns the best single store, the best pair and the savings between them', () => {
    const r = planShopping(list, DATA);
    expect(r.area).toBe('M5V');
    expect(r.stores.map((s) => s.id)).toEqual(['alpha', 'beta']);
    // alpha 500+1200+900 = 2600; beta 600+900+700 = 2200; pair: milk@alpha + chicken,rice@beta = 2100
    expect(r.bestSingle).toMatchObject({ storeIds: ['beta'], totalCents: 2200, complete: true });
    expect(r.bestPair).toMatchObject({ storeIds: ['alpha', 'beta'], totalCents: 2100, savingsVsRegularCents: 100 });
    expect(r.pairSavingsCents).toBe(100);
    expect(r.warnings).toEqual([]);
  });

  it('returns only the listings used by the returned plans', () => {
    const r = planShopping(list, DATA);
    expect(r.listings.map((l) => l.listingId).sort()).toEqual(['a-milk', 'b-chicken', 'b-milk', 'b-rice']);
  });

  it('reports line detail: needed vs purchased amounts and packs', () => {
    const r = planShopping(req([{ catalogItemId: 'rice', quantity: 3, unit: 'kg' }]), DATA);
    expect(r.bestSingle?.lines[0]).toMatchObject({
      storeId: 'beta',
      neededBase: 3000,
      purchasedBase: 4000,
      packs: [{ listingId: 'b-rice', count: 2, bundles: 0 }],
      costCents: 1400,
      dietary: 'ok',
    });
  });

  it('applies dietary restrictions, warns about conflicting items and marks items unavailable', () => {
    const r = planShopping(list, { ...DATA });
    const vegan = planShopping({ ...list, restrictions: ['vegan'] }, DATA);
    expect(r.bestSingle?.complete).toBe(true);
    expect(vegan.bestSingle?.unavailable.sort()).toEqual(['chicken', 'milk']);
    expect(vegan.bestSingle?.lines.map((l) => [l.catalogItemId, l.storeId, l.dietary])).toEqual([['rice', 'beta', 'ok']]);
    expect(vegan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Milk, 2% normally contains dairy/),
        expect.stringMatching(/Chicken thighs normally contains meat, poultry/),
        expect.stringMatching(/Milk, 2% is not available .* dietary needs/),
      ]),
    );
  });

  it('marks lines unverified when the chosen listing has no dietary information', () => {
    const r = planShopping({ ...req([{ catalogItemId: 'rice', quantity: 2, unit: 'kg' }]), restrictions: ['nut-free'] }, DATA);
    expect(r.bestSingle?.lines[0]?.dietary).toBe('unverified');
    expect(r.bestSingle?.unverifiedCount).toBe(1);
  });

  it('warns about an item no store carries and leaves pair savings null when coverage differs', () => {
    const r = planShopping(req([{ catalogItemId: 'flour', quantity: 1, unit: 'kg' }, { catalogItemId: 'milk', quantity: 4, unit: 'L' }]), DATA);
    expect(r.bestSingle).toMatchObject({ complete: false, unavailable: ['flour'] });
    expect(r.warnings).toContain('Flour is not available at any store near you this week.');
  });

  it('computes pair savings only when single and pair cover the same items', () => {
    const data: PlanningData = { ...DATA, listings: DATA.listings.filter((l) => l.listingId !== 'b-chicken' && l.listingId !== 'a-rice') };
    const r = planShopping(list, data);
    // no single store has everything; the pair does
    expect(r.bestSingle?.complete).toBe(false);
    expect(r.bestPair?.complete).toBe(true);
    expect(r.pairSavingsCents).toBeNull();
  });

  it('handles an area with no stores', () => {
    const r = planShopping(req([{ catalogItemId: 'milk', quantity: 1, unit: 'L' }], { postalCode: 'T2W 1Z9' }), DATA);
    expect(r).toMatchObject({ area: 'T2W', stores: [], bestSingle: null, bestPair: null, pairSavingsCents: null });
    expect(r.warnings).toEqual(['No stores in our coverage area yet for T2W.']);
  });

  it('handles an area with one store', () => {
    const r = planShopping(req([{ catalogItemId: 'milk', quantity: 1, unit: 'L' }], { postalCode: 'K1A 0B1' }), DATA);
    expect(r.bestSingle?.storeIds).toEqual(['gamma']);
    expect(r.bestPair).toBeNull();
    expect(r.warnings).toEqual(['Gamma has no current flyer; its prices are not included.', 'Only one store serves K1A, so there is no two-store option.']);
  });

  it('says so when a second store would not help', () => {
    const r = planShopping(req([{ catalogItemId: 'chicken', quantity: 1, unit: 'kg' }]), DATA);
    expect(r.bestPair).toBeNull();
    expect(r.warnings).toContain('A second store would not lower the cost of this list.');
  });
});

// ---------------------------------------------------------------------------
// Against the mock data
// ---------------------------------------------------------------------------

describe('planShopping — mock data', () => {
  const market = loadMarketData('2026-11-09');

  it('produces a sensible plan for a typical M5V list', () => {
    const r = planShopping(
      req([
        { catalogItemId: 'milk-2pct', quantity: 4, unit: 'L' },
        { catalogItemId: 'eggs-large', quantity: 1, unit: 'dozen' },
        { catalogItemId: 'bananas', quantity: 1, unit: 'kg' },
        { catalogItemId: 'chicken-breast-boneless', quantity: 1, unit: 'kg' },
        { catalogItemId: 'pasta-spaghetti', quantity: 900, unit: 'g' },
        { catalogItemId: 'beans-black-canned', quantity: 1620, unit: 'mL' },
        { catalogItemId: 'apples-gala', quantity: 2, unit: 'lb' },
      ]),
      market,
    );
    expect(r.stores.map((s) => s.id)).toEqual(['harbourfront-grocer', 'maple-basket', 'valucart']);
    expect(r.bestSingle?.complete).toBe(true);
    expect(r.bestPair?.complete).toBe(true);
    expect(new Set(r.bestPair?.lines.map((l) => l.storeId)).size).toBe(2);
    expect(r.pairSavingsCents).toBeGreaterThan(0);
    expect(r.bestPair!.totalCents).toBeLessThan(r.bestSingle!.totalCents);
    // Hand-checked against data/flyers: Maple Basket $32.20 alone; + ValuCart $31.28
    expect(r.bestSingle).toMatchObject({ storeIds: ['maple-basket'], totalCents: 3220 });
    expect(r.bestPair).toMatchObject({ storeIds: ['maple-basket', 'valucart'], totalCents: 3128 });
    expect(r.pairSavingsCents).toBe(92);
    // 3 cans of black beans at Maple Basket use the 3-for-$4 bundle
    expect(r.bestSingle!.lines.find((l) => l.catalogItemId === 'beans-black-canned')).toMatchObject({
      costCents: 400,
      packs: [{ listingId: 'mb-beans-black-canned', count: 3, bundles: 1 }],
    });
    // $4.99/lb chicken breast → 1 kg loose = $11.01
    expect(r.bestSingle!.lines.find((l) => l.catalogItemId === 'chicken-breast-boneless')).toMatchObject({
      costCents: 1101,
      loose: { listingId: 'mb-chicken-breast-boneless', base: 1000 },
    });
  });

  it('plans a 49-item list across 3 stores in under 200 ms', () => {
    const items = market.catalog.map((c) => ({
      catalogItemId: c.id,
      quantity: c.dimension === 'count' ? 6 : 2.5,
      unit: c.dimension === 'mass' ? ('kg' as const) : c.dimension === 'volume' ? ('L' as const) : ('each' as const),
    }));
    const start = performance.now();
    const r = planShopping({ postalCode: 'M6K 1A1', restrictions: [], items }, market);
    const ms = performance.now() - start;
    expect(r.stores).toHaveLength(3);
    expect(r.bestSingle).not.toBeNull();
    expect(ms).toBeLessThan(200);
  });
});
