import { describe, expect, it } from 'vitest';
import { cheapestPurchase, MAX_DP_CELLS, type Candidate } from '@/lib/engine/itemCost';
import type { DietaryStatus, NormalizedListing } from '@/lib/engine/types';

function pack(id: string, packBase: number, unitCents: number, extra: Partial<NormalizedListing> = {}, dietary: DietaryStatus = 'ok'): Candidate {
  return {
    dietary,
    listing: {
      listingId: id,
      storeId: 's1',
      catalogItemId: 'item',
      title: id,
      mode: 'pack',
      packBase,
      unitCents,
      pricePerDisplayUnit: 0,
      tags: [],
      contains: [],
      ...extra,
    },
  };
}

function loose(id: string, centsPerDisplayUnit: number, extra: Partial<NormalizedListing> = {}, dietary: DietaryStatus = 'ok'): Candidate {
  return {
    dietary,
    listing: {
      listingId: id,
      storeId: 's1',
      catalogItemId: 'item',
      title: id,
      mode: 'loose',
      unitCents: centsPerDisplayUnit,
      pricePerDisplayUnit: centsPerDisplayUnit,
      tags: [],
      contains: [],
      ...extra,
    },
  };
}

const packsOf = (r: ReturnType<typeof cheapestPurchase>) => r?.packs.map((p) => [p.listingId, p.packs, p.bundles]);

describe('whole packs', () => {
  const jug = pack('jug-4l', 4000, 589);
  const carton = pack('carton-1l', 1000, 259);

  it('charges a whole 4 L jug when only 1 L is needed and the jug is the only option', () => {
    const r = cheapestPurchase(1000, [jug], 'volume');
    expect(r).toMatchObject({ costCents: 589, purchasedBase: 4000, overbuyBase: 3000, packCount: 1 });
  });

  it('prefers the cheaper exact combination: 2 L → two 1 L cartons ($5.18 < $5.89)', () => {
    const r = cheapestPurchase(2000, [jug, carton], 'volume');
    expect(r?.costCents).toBe(518);
    expect(packsOf(r)).toEqual([['carton-1l', 2, 0]]);
  });

  it('mixes pack sizes: 5 L → one jug + one carton ($8.48)', () => {
    const r = cheapestPurchase(5000, [jug, carton], 'volume');
    expect(r?.costCents).toBe(848);
    expect(packsOf(r)).toEqual([
      ['carton-1l', 1, 0],
      ['jug-4l', 1, 0],
    ]);
    expect(r?.overbuyBase).toBe(0);
  });

  it('over-buys when that is cheapest: 3 L → one jug ($5.89 < 3 × $2.59)', () => {
    const r = cheapestPurchase(3000, [jug, carton], 'volume');
    expect(r).toMatchObject({ costCents: 589, overbuyBase: 1000 });
  });

  it('handles sizes that do not divide the need (gcd reduction): 1001 g from 500 g / 750 g packs', () => {
    const r = cheapestPurchase(1001, [pack('p500', 500, 300), pack('p750', 750, 400)], 'mass');
    // options covering ≥1001 g: 500+750=$7.00 (1250 g), 750+750=$8.00, 500×3=$9.00
    expect(r).toMatchObject({ costCents: 700, purchasedBase: 1250 });
  });
});

describe('multi-buy deals', () => {
  // Black beans: $1.49 each or 3 for $4.00, no regular price
  const beans = pack('beans', 540, 149, { multiBuy: { quantity: 3, totalCents: 400 } });

  it.each([
    [1, 149, 1, 0],
    [2, 298, 2, 0],
    [3, 400, 3, 1],
    [4, 549, 4, 1],
    [6, 800, 6, 2],
  ])('%i can(s) → %i¢ (%i packs, %i bundles)', (cans, cents, packCount, bundles) => {
    const r = cheapestPurchase(cans * 540, [beans], 'volume');
    expect(r?.costCents).toBe(cents);
    expect(r?.packCount).toBe(packCount);
    expect(r?.packs[0]?.bundles).toBe(bundles);
  });

  it('uses the bundle even when it over-buys, if that is cheaper (agreed option a)', () => {
    // single $3.00, or 2 for $2.50 → needing 1 still buys the bundle
    const r = cheapestPurchase(500, [pack('deal', 500, 300, { multiBuy: { quantity: 2, totalCents: 250 } })], 'mass');
    expect(r).toMatchObject({ costCents: 250, packCount: 2, overbuyBase: 500 });
  });

  it('prefers a single pack over an equal-cost bundle (fewer packs)', () => {
    const r = cheapestPurchase(500, [pack('deal', 500, 300, { multiBuy: { quantity: 2, totalCents: 300 } })], 'mass');
    expect(r).toMatchObject({ costCents: 300, packCount: 1, overbuyBase: 0 });
  });

  it('values bundles at N × regular price for savings', () => {
    // Greek yogurt: $5.49 (reg $5.99), 2 for $9.00
    const yogurt = pack('yogurt', 750, 549, { regularUnitCents: 599, multiBuy: { quantity: 2, totalCents: 900 } });
    const r = cheapestPurchase(1500, [yogurt], 'mass');
    expect(r).toMatchObject({ costCents: 900, regularCostCents: 1198 });
  });
});

describe('loose (per-unit) listings', () => {
  it('charges exactly the needed amount, rounded up to the cent', () => {
    // $4.39/kg × 1.5 kg = $6.585 → $6.59
    const r = cheapestPurchase(1500, [loose('apples', 439)], 'mass');
    expect(r).toMatchObject({ costCents: 659, purchasedBase: 1500, overbuyBase: 0, packCount: 1, packs: [] });
    expect(r?.loose).toEqual({ listingId: 'apples', base: 1500, costCents: 659 });
  });

  it('tops up a pack with loose: 2 kg → one 3 lb bag + 639 g loose', () => {
    const bag = pack('bag-3lb', 1361, 299);
    const r = cheapestPurchase(2000, [bag, loose('loose', 439)], 'mass');
    // bag $2.99 + 639 g × $4.39/kg = $2.805 → $2.81 ⇒ $5.80  (two bags $5.98, all loose $8.78)
    expect(r?.costCents).toBe(580);
    expect(packsOf(r)).toEqual([['bag-3lb', 1, 0]]);
    expect(r?.loose).toMatchObject({ base: 639, costCents: 281 });
  });

  it('uses the cheapest loose rate when a store has several', () => {
    const r = cheapestPurchase(1000, [loose('dear', 500), loose('cheap', 400)], 'mass');
    expect(r?.loose?.listingId).toBe('cheap');
  });

  it('works for count items', () => {
    expect(cheapestPurchase(3, [loose('cilantro', 79)], 'count')?.costCents).toBe(237);
  });

  it('computes regular cost for loose portions', () => {
    const r = cheapestPurchase(1000, [loose('apples', 439, { regularUnitCents: 549 })], 'mass');
    expect(r).toMatchObject({ costCents: 439, regularCostCents: 549 });
  });
});

describe('dietary status and tie-breaking', () => {
  it('prefers an ok listing over an equally priced unverified one', () => {
    const r = cheapestPurchase(1000, [pack('unv', 1000, 300, {}, 'unverified'), pack('ok', 1000, 300)], 'mass');
    expect(packsOf(r)).toEqual([['ok', 1, 0]]);
    expect(r?.dietary).toBe('ok');
  });

  it('still picks a cheaper unverified listing and reports the line as unverified', () => {
    const r = cheapestPurchase(1000, [pack('unv', 1000, 250, {}, 'unverified'), pack('ok', 1000, 300)], 'mass');
    expect(r).toMatchObject({ costCents: 250, dietary: 'unverified' });
  });

  it('marks the line unverified when only the loose top-up is unverified', () => {
    // bag $1.00 + 200 g × $4.00/kg = $1.80 beats two bags ($2.00)
    const r = cheapestPurchase(1200, [pack('bag', 1000, 100), loose('loose', 400, {}, 'unverified')], 'mass');
    expect(r?.loose).toBeDefined();
    expect(r?.dietary).toBe('unverified');
  });

  it('falls back to the sale price as regular when no regular price is known', () => {
    expect(cheapestPurchase(1000, [pack('p', 1000, 300)], 'mass')?.regularCostCents).toBe(300);
  });
});

describe('edge cases', () => {
  it('returns null when there are no candidates', () => {
    expect(cheapestPurchase(1000, [], 'mass')).toBeNull();
  });

  it('rejects invalid needed amounts', () => {
    expect(() => cheapestPurchase(0, [pack('p', 1, 1)], 'mass')).toThrow(RangeError);
    expect(() => cheapestPurchase(1.5, [pack('p', 1, 1)], 'mass')).toThrow(RangeError);
  });

  it('rejects candidates from different stores or items', () => {
    const other = pack('x', 1000, 100);
    other.listing.storeId = 's2';
    expect(() => cheapestPurchase(1000, [pack('p', 1000, 100), other], 'mass')).toThrow(/single store/);
  });

  it('refuses inputs beyond the DP safety cap', () => {
    expect(() => cheapestPurchase(MAX_DP_CELLS + 1, [pack('p', 1, 1)], 'mass')).toThrow(/too large/);
  });

  it('is fast for a 25 kg line with awkward pack sizes', () => {
    const candidates = [pack('a', 454, 499), pack('b', 750, 699, { multiBuy: { quantity: 2, totalCents: 1200 } }), pack('c', 907, 899), loose('l', 1100)];
    const start = performance.now();
    const r = cheapestPurchase(25_000, candidates, 'mass');
    const ms = performance.now() - start;
    expect(r).not.toBeNull();
    expect(r!.purchasedBase).toBeGreaterThanOrEqual(25_000);
    expect(ms).toBeLessThan(50);
  });
});

describe('brute-force cross-check (small cases)', () => {
  it('matches exhaustive search over pack counts', () => {
    const a = pack('a', 300, 250);
    const b = pack('b', 500, 390, { multiBuy: { quantity: 3, totalCents: 1000 } });
    for (let need = 50; need <= 3000; need += 137) {
      let bestCost = Infinity;
      for (let na = 0; na <= 12; na++) {
        for (let nb = 0; nb <= 8; nb++) {
          if (na * 300 + nb * 500 < need) continue;
          const bCost = Math.floor(nb / 3) * 1000 + (nb % 3) * 390;
          bestCost = Math.min(bestCost, na * 250 + bCost);
        }
      }
      expect(cheapestPurchase(need, [a, b], 'mass')?.costCents, `need ${need}`).toBe(bestCost);
    }
  });
});
