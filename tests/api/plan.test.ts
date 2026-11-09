import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/plan/route';
import { isoDateIn, resolveAsOf } from '@/lib/data/asOf';

const post = (body: unknown, raw = false) =>
  POST(
    new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );

const LIST = [
  { catalogItemId: 'milk-2pct', quantity: 4, unit: 'L' },
  { catalogItemId: 'eggs-large', quantity: 1, unit: 'dozen' },
  { catalogItemId: 'bananas', quantity: 1, unit: 'kg' },
  { catalogItemId: 'chicken-breast-boneless', quantity: 1, unit: 'kg' },
  { catalogItemId: 'pasta-spaghetti', quantity: 900, unit: 'g' },
  { catalogItemId: 'beans-black-canned', quantity: 1620, unit: 'mL' },
  { catalogItemId: 'apples-gala', quantity: 2, unit: 'lb' },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/plan — success', () => {
  it('returns single and two-store plans for the mock week', async () => {
    const res = await post({ postalCode: 'm5v2t6', items: LIST, asOf: '2026-11-09' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      asOf: '2026-11-09',
      area: 'M5V',
      bestSingle: { storeIds: ['maple-basket'], totalCents: 3220, complete: true },
      bestPair: { storeIds: ['maple-basket', 'valucart'], totalCents: 3128 },
      pairSavingsCents: 92,
      warnings: [],
    });
    expect(body.stores).toHaveLength(3);
    expect(body.listings.length).toBeGreaterThan(0);
  });

  it('defaults restrictions to none and applies them when given', async () => {
    const res = await post({ postalCode: 'M5V 2T6', restrictions: ['vegan'], items: LIST, asOf: '2026-11-09' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.bestSingle.unavailable).toEqual(expect.arrayContaining(['milk-2pct', 'eggs-large', 'chicken-breast-boneless']));
    expect(body.warnings.some((w: string) => /conflicts with vegan/.test(w))).toBe(true);
  });

  it('uses DEMO_AS_OF when the request has no asOf', async () => {
    vi.stubEnv('DEMO_AS_OF', '2026-11-09');
    const body = await (await post({ postalCode: 'M5V 2T6', items: LIST })).json();
    expect(body.asOf).toBe('2026-11-09');
    expect(body.bestSingle.complete).toBe(true);
  });

  it('ignores flyers outside the date and says so', async () => {
    const body = await (await post({ postalCode: 'M5V 2T6', items: LIST.slice(0, 1), asOf: '2026-11-20' })).json();
    expect(body.bestSingle.complete).toBe(false);
    expect(body.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Maple Basket Market has no current flyer/)]));
  });

  it('returns 200 with a coverage warning for an area with no stores', async () => {
    const res = await post({ postalCode: 'V6B 1A1', items: LIST, asOf: '2026-11-09' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ area: 'V6B', stores: [], bestSingle: null, bestPair: null });
    expect(body.warnings).toEqual(['No stores in our coverage area yet for V6B.']);
  });
});

describe('POST /api/plan — errors', () => {
  it('400 INVALID_JSON for a malformed body', async () => {
    const res = await post('{ nope', true);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_JSON');
  });

  it.each([
    ['missing items', { postalCode: 'M5V 2T6' }, 'items'],
    ['unknown restriction', { postalCode: 'M5V 2T6', restrictions: ['keto'], items: LIST }, 'restrictions.0'],
    ['fluid ounces', { postalCode: 'M5V 2T6', items: [{ catalogItemId: 'milk-2pct', quantity: 64, unit: 'fl oz' }] }, 'items.0.unit'],
    ['string quantity', { postalCode: 'M5V 2T6', items: [{ catalogItemId: 'milk-2pct', quantity: '4', unit: 'L' }] }, 'items.0.quantity'],
    ['negative quantity', { postalCode: 'M5V 2T6', items: [{ catalogItemId: 'milk-2pct', quantity: -1, unit: 'L' }] }, 'items.0.quantity'],
    ['unexpected key', { postalCode: 'M5V 2T6', items: LIST, userId: 7 }, ''],
    ['impossible asOf', { postalCode: 'M5V 2T6', items: LIST, asOf: '2026-02-30' }, 'asOf'],
    ['51 items', { postalCode: 'M5V 2T6', items: Array(51).fill(LIST[0]) }, 'items'],
  ])('400 INVALID_REQUEST for %s', async (_name, body, path) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('INVALID_REQUEST');
    expect(json.issues.map((i: { path: string }) => i.path)).toContain(path);
  });

  it('400 with engine issue codes for business-rule violations', async () => {
    const res = await post({
      postalCode: 'M5V 2T6',
      items: [
        { catalogItemId: 'unicorn-steak', quantity: 1, unit: 'kg' },
        { catalogItemId: 'milk-2pct', quantity: 1, unit: 'kg' },
        { catalogItemId: 'rice-basmati', quantity: 30, unit: 'kg' },
      ],
      asOf: '2026-11-09',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues.map((i: { code: string; itemIndex: number }) => [i.code, i.itemIndex])).toEqual([
      ['UNKNOWN_ITEM', 0],
      ['DIMENSION_MISMATCH', 1],
      ['QUANTITY_TOO_LARGE', 2],
    ]);
  });

  it('400 for an invalid postal code and for an empty list', async () => {
    const bad = await (await post({ postalCode: '90210', items: LIST, asOf: '2026-11-09' })).json();
    expect(bad.issues[0].code).toBe('INVALID_POSTAL_CODE');
    const empty = await (await post({ postalCode: 'M5V 2T6', items: [], asOf: '2026-11-09' })).json();
    expect(empty.issues[0].code).toBe('EMPTY_LIST');
  });

  it('500 with a generic message when data loading fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = await import('@/lib/data/loader');
    vi.spyOn(loader, 'loadMarketData').mockImplementation(() => {
      throw new loader.DataLoadError('catalog.json is invalid');
    });
    const res = await post({ postalCode: 'M5V 2T6', items: LIST, asOf: '2026-11-09' });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: 'INTERNAL_ERROR', message: 'Something went wrong while planning your trip.' });
    expect(JSON.stringify(json)).not.toMatch(/catalog\.json/); // no internals leaked
    expect(err).toHaveBeenCalled();
  });
});

describe('resolveAsOf', () => {
  const now = new Date('2026-11-10T03:30:00Z'); // 22:30 on Nov 9 in Toronto

  it('uses Toronto time for "today"', () => {
    expect(isoDateIn(now)).toBe('2026-11-09');
    expect(isoDateIn(now, 'UTC')).toBe('2026-11-10');
    expect(resolveAsOf(undefined, undefined, now)).toBe('2026-11-09');
  });

  it('prefers the request date, then DEMO_AS_OF, then today', () => {
    expect(resolveAsOf('2026-01-02', '2026-11-09', now)).toBe('2026-01-02');
    expect(resolveAsOf(undefined, '2026-11-05', now)).toBe('2026-11-05');
  });

  it('ignores an invalid DEMO_AS_OF with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveAsOf(undefined, 'next tuesday', now)).toBe('2026-11-09');
    expect(warn).toHaveBeenCalledOnce();
  });
});
