import { describe, expect, it } from 'vitest';
import { flyerStatusOn, indexCatalog, ingestFlyer, ingestFlyers } from '@/lib/engine/ingest';
import { AS_OF, CATALOG, mixedFlyer } from '../fixtures/ingest';

const catalog = indexCatalog(CATALOG);

describe('flyerStatusOn', () => {
  it('treats both ends of the window as inclusive', () => {
    expect(flyerStatusOn('2026-11-05', '2026-11-11', '2026-11-05')).toBe('active');
    expect(flyerStatusOn('2026-11-05', '2026-11-11', '2026-11-11')).toBe('active');
    expect(flyerStatusOn('2026-11-05', '2026-11-11', '2026-11-04')).toBe('not_yet_valid');
    expect(flyerStatusOn('2026-11-05', '2026-11-11', '2026-11-12')).toBe('expired');
  });
});

describe('ingestFlyer — mixed flyer', () => {
  const result = ingestFlyer(mixedFlyer(), catalog, AS_OF);
  const byId = new Map(result.listings.map((l) => [l.listingId, l]));
  const reasonOf = (id: string) => result.rejections.find((r) => r.listingId === id)?.reason;

  it('keeps the flyer active and accepts exactly the valid listings', () => {
    expect(result.status).toBe('active');
    expect([...byId.keys()].sort()).toEqual(
      ['fm-apples-lb', 'fm-cilantro', 'fm-eggs-dozen', 'fm-milk-4l', 'fm-yogurt-650'].sort(),
    );
    // the duplicate "fm-milk-4l" must not replace the original
    expect(byId.get('fm-milk-4l')?.title).toBe('Dairyland 2% Milk 4 L');
  });

  it('records one rejection per bad listing with the right reason', () => {
    expect(reasonOf('bad-no-size')).toBe('MISSING_SIZE');
    expect(reasonOf('bad-unknown-item')).toBe('UNKNOWN_CATALOG_ITEM');
    expect(reasonOf('bad-volume-for-mass')).toBe('DIMENSION_MISMATCH');
    expect(reasonOf('bad-fl-oz')).toBe('SCHEMA_INVALID');
    expect(reasonOf('bad-multibuy-qty')).toBe('INVALID_MULTIBUY');
    expect(reasonOf('bad-multibuy-loose')).toBe('INVALID_MULTIBUY');
    expect(reasonOf('bad-float-price')).toBe('SCHEMA_INVALID');
    expect(reasonOf('bad-regular-below-sale')).toBe('SCHEMA_INVALID');
    expect(reasonOf('bad-typo-key')).toBe('SCHEMA_INVALID');
    expect(reasonOf('#15')).toBe('SCHEMA_INVALID'); // non-object listing, identified by index
    const dup = result.rejections.filter((r) => r.listingId === 'fm-milk-4l');
    expect(dup).toHaveLength(1);
    expect(dup[0]?.detail).toMatch(/duplicate listing id/);
    expect(result.rejections).toHaveLength(11);
    expect(result.rejections.every((r) => r.storeId === 'fresh-mart' && r.detail.length > 0)).toBe(true);
  });

  it('normalizes a volume pack to millilitres and $/L', () => {
    expect(byId.get('fm-milk-4l')).toEqual({
      listingId: 'fm-milk-4l',
      storeId: 'fresh-mart',
      catalogItemId: 'milk-2pct',
      title: 'Dairyland 2% Milk 4 L',
      brand: 'Dairyland',
      mode: 'pack',
      packBase: 4000,
      unitCents: 599,
      regularUnitCents: 689,
      pricePerDisplayUnit: 150, // $5.99 / 4 L = $1.4975 → $1.50
      tags: [],
      contains: ['dairy'],
    });
  });

  it('normalizes a mass pack to grams and $/kg, keeping the multi-buy and de-duplicating tags', () => {
    const yogurt = byId.get('fm-yogurt-650');
    expect(yogurt).toMatchObject({ mode: 'pack', packBase: 650, unitCents: 449, pricePerDisplayUnit: 691 });
    expect(yogurt?.multiBuy).toEqual({ quantity: 2, totalCents: 800 });
    expect(yogurt?.tags).toEqual(['gluten-free']);
  });

  it('converts a per-lb loose price to $/kg (sale and regular)', () => {
    // $1.99/lb × 2.20462 lb/kg = $4.387 → $4.39/kg; $2.49/lb → $5.489 → $5.49/kg
    expect(byId.get('fm-apples-lb')).toMatchObject({
      mode: 'loose',
      unitCents: 439,
      regularUnitCents: 549,
      pricePerDisplayUnit: 439,
    });
    expect(byId.get('fm-apples-lb')?.packBase).toBeUndefined();
  });

  it('expands a dozen pack to 12 each', () => {
    expect(byId.get('fm-eggs-dozen')).toMatchObject({ mode: 'pack', packBase: 12, pricePerDisplayUnit: 36 });
  });

  it('keeps an "each" loose price unchanged', () => {
    expect(byId.get('fm-cilantro')).toMatchObject({ mode: 'loose', unitCents: 149, pricePerDisplayUnit: 149 });
  });
});

describe('ingestFlyer — flyer-level outcomes', () => {
  it('ignores an expired flyer with a warning', () => {
    const r = ingestFlyer({ ...mixedFlyer(), validTo: '2026-11-08' }, catalog, AS_OF);
    expect(r.status).toBe('expired');
    expect(r.listings).toEqual([]);
    expect(r.rejections).toEqual([]);
    expect(r.warnings[0]).toMatch(/expired on 2026-11-08/);
  });

  it('ignores a not-yet-valid flyer with a warning', () => {
    const r = ingestFlyer({ ...mixedFlyer(), validFrom: '2026-11-12', validTo: '2026-11-18' }, catalog, AS_OF);
    expect(r.status).toBe('not_yet_valid');
    expect(r.warnings[0]).toMatch(/not valid until 2026-11-12/);
  });

  it('skips an unreadable envelope but reports its store id when available', () => {
    const r = ingestFlyer({ storeId: 'fresh-mart', listings: [] }, catalog, AS_OF);
    expect(r.status).toBe('invalid');
    expect(r.storeId).toBe('fresh-mart');
    expect(r.warnings[0]).toMatch(/fresh-mart.*invalid/);

    const r2 = ingestFlyer(null, catalog, AS_OF);
    expect(r2).toMatchObject({ status: 'invalid', storeId: null });
  });

  it('rejects a malformed asOf date', () => {
    expect(() => ingestFlyer(mixedFlyer(), catalog, '09/11/2026')).toThrow(RangeError);
  });
});

describe('ingestFlyers', () => {
  it('merges listings, rejections and warnings across flyers', () => {
    const other = {
      storeId: 'value-foods',
      validFrom: '2026-11-06',
      validTo: '2026-11-12',
      listings: [
        {
          id: 'vf-milk-1l',
          catalogItemId: 'milk-2pct',
          title: '2% Milk 1 L',
          pricing: { kind: 'pack', priceCents: 249, size: 1, unit: 'L' },
        },
      ],
    };
    const expired = { ...other, storeId: 'old-store', validFrom: '2026-10-01', validTo: '2026-10-07' };

    const r = ingestFlyers([mixedFlyer(), other, expired], catalog, AS_OF);
    expect(r.listings).toHaveLength(6);
    expect(r.rejections).toHaveLength(11);
    expect(r.flyers).toEqual([
      { storeId: 'fresh-mart', status: 'active' },
      { storeId: 'value-foods', status: 'active' },
      { storeId: 'old-store', status: 'expired' },
    ]);
    expect(r.warnings).toHaveLength(1);
  });

  it('warns when a store has two active flyers', () => {
    const r = ingestFlyers([mixedFlyer(), mixedFlyer()], catalog, AS_OF);
    expect(r.warnings.some((w) => /more than one active flyer/.test(w))).toBe(true);
  });
});
