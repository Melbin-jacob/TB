import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, loadMarketData, loadReferenceData } from '@/lib/data/loader';

const AS_OF = '2026-11-09'; // inside the mock flyer week (2026-11-05 … 2026-11-11)

describe('mock data in data/', () => {
  const market = loadMarketData(AS_OF);

  it('loads with zero rejections and zero warnings', () => {
    expect(market.rejections).toEqual([]);
    expect(market.warnings).toEqual([]);
  });

  it('has a 40–60 item catalog and 5 stores', () => {
    expect(market.catalog.length).toBeGreaterThanOrEqual(40);
    expect(market.catalog.length).toBeLessThanOrEqual(60);
    expect(market.stores).toHaveLength(5);
  });

  it('has exactly one active flyer per store, each with 20–40 listings', () => {
    expect(market.flyers.map((f) => f.status)).toEqual(Array(5).fill('active'));
    expect(new Set(market.flyers.map((f) => f.storeId))).toEqual(new Set(market.stores.map((s) => s.id)));
    for (const store of market.stores) {
      const count = market.listings.filter((l) => l.storeId === store.id).length;
      expect(count, store.id).toBeGreaterThanOrEqual(20);
      expect(count, store.id).toBeLessThanOrEqual(40);
    }
  });

  it('serves every postal area with at least 2 stores', () => {
    const perFsa = new Map<string, number>();
    for (const s of market.stores) for (const fsa of s.fsas) perFsa.set(fsa, (perFsa.get(fsa) ?? 0) + 1);
    expect(perFsa.size).toBeGreaterThanOrEqual(3);
    for (const [fsa, count] of perFsa) expect(count, fsa).toBeGreaterThanOrEqual(2);
  });

  it('has globally unique listing ids', () => {
    const ids = market.listings.map((l) => l.listingId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exercises the scenarios later steps depend on', () => {
    const listed = new Set(market.listings.map((l) => l.catalogItemId));
    // items absent from every flyer → "unavailable everywhere"
    expect(market.catalog.filter((c) => !listed.has(c.id)).length).toBeGreaterThanOrEqual(1);
    // every dimension and both pricing modes
    expect(market.listings.some((l) => l.mode === 'loose')).toBe(true);
    expect(market.listings.some((l) => l.mode === 'pack')).toBe(true);
    // multi-buys with and without a regular price
    expect(market.listings.some((l) => l.multiBuy && l.regularUnitCents !== undefined)).toBe(true);
    expect(market.listings.some((l) => l.multiBuy && l.regularUnitCents === undefined)).toBe(true);
    // dietary: tagged, conflicting, and no-information listings
    expect(market.listings.some((l) => l.tags.includes('halal'))).toBe(true);
    expect(market.listings.some((l) => l.tags.includes('vegan'))).toBe(true);
    expect(market.listings.some((l) => l.contains.length > 0)).toBe(true);
    expect(market.listings.some((l) => l.tags.length === 0 && l.contains.length === 0)).toBe(true);
    // the same item offered by several stores, so comparison is meaningful
    const storesPerItem = new Map<string, Set<string>>();
    for (const l of market.listings) {
      if (!storesPerItem.has(l.catalogItemId)) storesPerItem.set(l.catalogItemId, new Set());
      storesPerItem.get(l.catalogItemId)?.add(l.storeId);
    }
    expect([...storesPerItem.values()].filter((s) => s.size >= 3).length).toBeGreaterThanOrEqual(10);
  });

  it('ignores every flyer outside its week', () => {
    const later = loadMarketData('2026-11-12');
    expect(later.listings).toEqual([]);
    expect(later.flyers.every((f) => f.status === 'expired')).toBe(true);
    expect(later.warnings).toHaveLength(5);
  });
});

describe('loader failure handling', () => {
  let dir: string;
  const write = (rel: string, value: unknown) => {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const catalog = [{ id: 'milk-2pct', name: 'Milk, 2%', dimension: 'volume', displayUnit: 'L', inherentContains: ['dairy'] }];
  const stores = [{ id: 'store-a', name: 'Store A', address: '1 Test St', fsas: ['M5V'] }];
  const flyer = (storeId: string, listings: unknown[] = []) => ({
    storeId,
    validFrom: '2026-11-05',
    validTo: '2026-11-11',
    listings,
  });

  const setup = () => {
    dir = mkdtempSync(path.join(tmpdir(), 'loader-test-'));
    write('catalog.json', catalog);
    write('stores.json', stores);
    mkdirSync(path.join(dir, 'flyers'));
  };

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('throws DataLoadError for an invalid catalog or store list', () => {
    setup();
    write('catalog.json', [{ ...catalog[0], dimension: 'mass' }]);
    expect(() => loadReferenceData(dir)).toThrow(DataLoadError);
    expect(() => loadReferenceData(dir)).toThrow(/catalog\.json is invalid/);

    write('catalog.json', catalog);
    write('stores.json', '{ not json');
    expect(() => loadReferenceData(dir)).toThrow(/cannot read stores\.json/);
  });

  it('skips unreadable flyer files and flyers for unknown stores, with warnings', () => {
    setup();
    write('flyers/broken.json', '{ nope');
    write('flyers/ghost.json', flyer('ghost-store'));
    write('flyers/store-a.json', flyer('store-a'));
    write('flyers/readme.txt', 'ignored: not a .json file');

    const market = loadMarketData('2026-11-09', dir);
    expect(market.flyers.map((f) => [f.file, f.status])).toEqual([
      ['ghost.json', 'invalid'],
      ['store-a.json', 'active'],
    ]);
    expect(market.warnings).toHaveLength(2);
    expect(market.warnings[0]).toMatch(/broken\.json.*could not be read/);
    expect(market.warnings[1]).toMatch(/unknown store "ghost-store"/);
  });

  it('keeps good listings, rejects bad ones and logs the rejections', () => {
    setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    write(
      'flyers/store-a.json',
      flyer('store-a', [
        { id: 'ok', catalogItemId: 'milk-2pct', title: 'Milk 4 L', pricing: { kind: 'pack', priceCents: 599, size: 4, unit: 'L' } },
        { id: 'bad', catalogItemId: 'milk-2pct', title: 'Milk ?', pricing: { kind: 'pack', priceCents: 599 } },
      ]),
    );

    const market = loadMarketData('2026-11-09', dir);
    expect(market.listings.map((l) => l.listingId)).toEqual(['ok']);
    expect(market.rejections).toMatchObject([{ storeId: 'store-a', listingId: 'bad', reason: 'MISSING_SIZE' }]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/store-a\/bad MISSING_SIZE/);
  });

  it('warns when one store has two active flyers', () => {
    setup();
    write('flyers/a1.json', flyer('store-a'));
    write('flyers/a2.json', flyer('store-a'));
    const market = loadMarketData('2026-11-09', dir);
    expect(market.warnings.some((w) => /store-a" has 2 active flyers/.test(w))).toBe(true);
  });

  it('throws when the flyer directory is missing', () => {
    setup();
    rmSync(path.join(dir, 'flyers'), { recursive: true });
    expect(() => loadMarketData('2026-11-09', dir)).toThrow(/cannot read flyer directory/);
  });
});
