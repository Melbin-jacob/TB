import { describe, expect, it } from 'vitest';
import { catalogSchema, flyerSchema, storesSchema } from '@/lib/engine/schemas';
import { CATALOG } from '../fixtures/ingest';

describe('catalogSchema', () => {
  it('accepts the fixture catalog', () => {
    expect(catalogSchema.safeParse(CATALOG).success).toBe(true);
  });

  it('defaults inherentContains to []', () => {
    const parsed = catalogSchema.parse([{ id: 'rice', name: 'Rice', dimension: 'mass', displayUnit: 'kg' }]);
    expect(parsed[0]?.inherentContains).toEqual([]);
  });

  it('rejects a display unit that does not match the dimension', () => {
    const r = catalogSchema.safeParse([{ id: 'milk', name: 'Milk', dimension: 'volume', displayUnit: 'kg' }]);
    expect(r.success).toBe(false);
  });

  it('rejects duplicate ids, non-slug ids, and unknown keys', () => {
    const item = { id: 'rice', name: 'Rice', dimension: 'mass', displayUnit: 'kg' };
    expect(catalogSchema.safeParse([item, item]).success).toBe(false);
    expect(catalogSchema.safeParse([{ ...item, id: 'Rice White' }]).success).toBe(false);
    expect(catalogSchema.safeParse([{ ...item, colour: 'white' }]).success).toBe(false);
  });

  it('rejects an empty catalog', () => {
    expect(catalogSchema.safeParse([]).success).toBe(false);
  });
});

describe('storesSchema', () => {
  const store = { id: 'fresh-mart', name: 'Fresh Mart', address: '1 King St W, Toronto', fsas: ['M5V', 'M5J'] };

  it('accepts valid stores', () => {
    expect(storesSchema.safeParse([store]).success).toBe(true);
  });

  it('rejects invalid FSAs, empty coverage and duplicate ids', () => {
    expect(storesSchema.safeParse([{ ...store, fsas: ['m5v'] }]).success).toBe(false);
    expect(storesSchema.safeParse([{ ...store, fsas: ['D5V'] }]).success).toBe(false);
    expect(storesSchema.safeParse([{ ...store, fsas: [] }]).success).toBe(false);
    expect(storesSchema.safeParse([store, store]).success).toBe(false);
  });
});

describe('flyerSchema (envelope)', () => {
  const flyer = { storeId: 'fresh-mart', validFrom: '2026-11-05', validTo: '2026-11-11', listings: [] };

  it('accepts a valid envelope without validating listings', () => {
    expect(flyerSchema.safeParse({ ...flyer, listings: ['anything', 42] }).success).toBe(true);
  });

  it('rejects impossible dates and inverted windows', () => {
    expect(flyerSchema.safeParse({ ...flyer, validTo: '2026-02-30' }).success).toBe(false);
    expect(flyerSchema.safeParse({ ...flyer, validFrom: '2026-11-12' }).success).toBe(false);
  });
});
