import { describe, expect, it } from 'vitest';
import { loadMarketData } from '@/lib/data/loader';
import { assessListing, catalogConflicts, filterListings, RESTRICTION_EXCLUDES } from '@/lib/engine/dietary';
import { indexCatalog } from '@/lib/engine/ingest';
import type { CatalogItem, NormalizedListing } from '@/lib/engine/types';

const ITEMS: Record<string, CatalogItem> = {
  pasta: { id: 'pasta', name: 'Pasta, spaghetti', dimension: 'mass', displayUnit: 'kg', inherentContains: ['gluten'] },
  chicken: { id: 'chicken', name: 'Chicken thighs', dimension: 'mass', displayUnit: 'kg', inherentContains: ['meat', 'poultry'] },
  pork: { id: 'pork', name: 'Pork chops', dimension: 'mass', displayUnit: 'kg', inherentContains: ['meat', 'pork'] },
  tofu: { id: 'tofu', name: 'Tofu, firm', dimension: 'mass', displayUnit: 'kg', inherentContains: [] },
  yogurt: { id: 'yogurt', name: 'Greek yogurt', dimension: 'mass', displayUnit: 'kg', inherentContains: ['dairy'] },
};
const catalog = indexCatalog(Object.values(ITEMS));

function listing(id: string, catalogItemId: string, extra: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    listingId: id,
    storeId: 's',
    catalogItemId,
    title: id,
    mode: 'pack',
    packBase: 1000,
    unitCents: 100,
    pricePerDisplayUnit: 100,
    tags: [],
    contains: [],
    ...extra,
  };
}

const assess = (l: NormalizedListing, restrictions: Parameters<typeof assessListing>[2]) =>
  assessListing(l, catalog.get(l.catalogItemId), restrictions);

describe('assessListing — the three outcomes', () => {
  it('is ok when no restrictions are selected, whatever the listing contains', () => {
    expect(assess(listing('x', 'chicken', { contains: ['meat'] }), [])).toEqual({ status: 'ok', reasons: [] });
  });

  it('is ok when the listing is tagged for the restriction', () => {
    expect(assess(listing('t', 'tofu', { tags: ['vegan'] }), ['vegan']).status).toBe('ok');
  });

  it('is excluded when the listing contains a forbidden ingredient', () => {
    const r = assess(listing('y', 'tofu', { contains: ['dairy'] }), ['dairy-free']);
    expect(r.status).toBe('excluded');
    expect(r.reasons[0]).toMatch(/dairy-free: listing contains dairy/);
  });

  it('is unverified when there is no evidence either way', () => {
    const r = assess(listing('t', 'tofu'), ['vegan']);
    expect(r).toEqual({ status: 'unverified', reasons: ['vegan: not confirmed by the flyer'] });
  });
});

describe('assessListing — precedence', () => {
  it('excludes via the catalog item when the listing gives no information', () => {
    const r = assess(listing('c', 'chicken'), ['vegetarian']);
    expect(r.status).toBe('excluded');
    expect(r.reasons[0]).toMatch(/Chicken thighs normally contains meat, poultry/);
  });

  it('lets a listing tag override the catalog default (gluten-free pasta)', () => {
    expect(assess(listing('gf', 'pasta', { tags: ['gluten-free'] }), ['gluten-free']).status).toBe('ok');
    expect(assess(listing('reg', 'pasta'), ['gluten-free']).status).toBe('excluded');
  });

  it('excludes a self-contradictory listing (tag says yes, contains says no)', () => {
    expect(assess(listing('bad', 'tofu', { tags: ['vegan'], contains: ['dairy'] }), ['vegan']).status).toBe('excluded');
  });

  it('expands implied tags: vegan ⇒ vegetarian and dairy-free', () => {
    const tofu = listing('t', 'tofu', { tags: ['vegan'] });
    expect(assess(tofu, ['vegetarian']).status).toBe('ok');
    expect(assess(tofu, ['dairy-free']).status).toBe('ok');
    expect(assess(tofu, ['nut-free']).status).toBe('unverified'); // not implied
  });

  it('treats meat as acceptable-but-unverified for halal unless pork or tagged', () => {
    expect(assess(listing('c', 'chicken', { contains: ['meat', 'poultry'] }), ['halal']).status).toBe('unverified');
    expect(assess(listing('ch', 'chicken', { tags: ['halal'] }), ['halal']).status).toBe('ok');
    expect(assess(listing('p', 'pork'), ['halal']).status).toBe('excluded');
    expect(assess(listing('p', 'pork'), ['kosher']).status).toBe('excluded');
  });
});

describe('assessListing — multiple restrictions', () => {
  it('takes the worst outcome: excluded beats unverified beats ok', () => {
    const tofu = listing('t', 'tofu', { tags: ['vegan'] });
    expect(assess(tofu, ['vegan', 'gluten-free'])).toEqual({
      status: 'unverified',
      reasons: ['gluten-free: not confirmed by the flyer'],
    });
    expect(assess(listing('t2', 'tofu', { tags: ['vegan', 'gluten-free'] }), ['vegan', 'gluten-free']).status).toBe('ok');

    const r = assess(listing('y', 'yogurt'), ['vegan', 'nut-free']);
    expect(r.status).toBe('excluded');
    expect(r.reasons).toHaveLength(1); // only the excluded reason is reported
  });

  it('ignores duplicate restrictions', () => {
    expect(assess(listing('t', 'tofu'), ['vegan', 'vegan']).reasons).toHaveLength(1);
  });

  it('treats an unknown catalog item as having no inherent ingredients', () => {
    expect(assessListing(listing('m', 'mystery'), undefined, ['vegan']).status).toBe('unverified');
  });
});

describe('filterListings', () => {
  it('splits listings into eligible (ok / unverified) and excluded, preserving order', () => {
    const listings = [
      listing('tofu-tagged', 'tofu', { tags: ['vegan'] }),
      listing('chicken', 'chicken'),
      listing('tofu-plain', 'tofu'),
      listing('yogurt', 'yogurt', { contains: ['dairy'] }),
    ];
    const r = filterListings(listings, catalog, ['vegan']);
    expect(r.eligible.map((e) => [e.listing.listingId, e.dietary])).toEqual([
      ['tofu-tagged', 'ok'],
      ['tofu-plain', 'unverified'],
    ]);
    expect(r.excluded.map((e) => e.listing.listingId)).toEqual(['chicken', 'yogurt']);
    expect(r.excluded.every((e) => e.reasons.length > 0)).toBe(true);
  });
});

describe('catalogConflicts', () => {
  it('warns for list items whose type conflicts with a restriction', () => {
    const r = catalogConflicts([ITEMS.chicken!, ITEMS.tofu!, ITEMS.yogurt!], ['vegan', 'gluten-free']);
    expect(r.map((c) => [c.catalogItemId, c.restriction, c.ingredients])).toEqual([
      ['chicken', 'vegan', ['meat', 'poultry']],
      ['yogurt', 'vegan', ['dairy']],
    ]);
    expect(r[0]?.message).toMatch(/Chicken thighs normally contains meat, poultry, which conflicts with vegan/);
  });

  it('returns nothing without restrictions', () => {
    expect(catalogConflicts(Object.values(ITEMS), [])).toEqual([]);
  });
});

describe('RESTRICTION_EXCLUDES', () => {
  it('makes vegan at least as strict as vegetarian and dairy-free', () => {
    for (const i of [...RESTRICTION_EXCLUDES.vegetarian, ...RESTRICTION_EXCLUDES['dairy-free']]) {
      expect(RESTRICTION_EXCLUDES.vegan).toContain(i);
    }
  });
});

describe('against the mock data', () => {
  const market = loadMarketData('2026-11-09');

  it('vegan excludes every meat, fish and dairy listing but keeps produce', () => {
    const r = filterListings(market.listings, market.catalogIndex, ['vegan']);
    const excludedItems = new Set(r.excluded.map((e) => e.listing.catalogItemId));
    for (const id of ['chicken-thighs-boneless', 'ground-beef-lean', 'salmon-fillet', 'milk-2pct', 'eggs-large', 'honey']) {
      expect(excludedItems, id).toContain(id);
    }
    const eligibleItems = new Set(r.eligible.map((e) => e.listing.catalogItemId));
    for (const id of ['bananas', 'tofu-firm', 'milk-oat', 'apples-gala']) expect(eligibleItems, id).toContain(id);
    // nothing that conflicts with vegan survives unless the listing itself is tagged vegan
    const leaks = r.eligible.filter(
      (e) =>
        !e.listing.tags.includes('vegan') &&
        [...e.listing.contains, ...(market.catalogIndex.get(e.listing.catalogItemId)?.inherentContains ?? [])].some((i) =>
          RESTRICTION_EXCLUDES.vegan.includes(i),
        ),
    );
    expect(leaks).toEqual([]);
  });

  it('halal keeps tagged chicken as ok and untagged chicken as unverified', () => {
    const r = filterListings(market.listings, market.catalogIndex, ['halal']);
    const chicken = r.eligible.filter((e) => e.listing.catalogItemId === 'chicken-thighs-boneless');
    expect(chicken.some((e) => e.dietary === 'ok')).toBe(true);
    expect(chicken.some((e) => e.dietary === 'unverified')).toBe(true);
    expect(r.excluded.some((e) => e.listing.catalogItemId === 'bacon')).toBe(true);
  });
});
