import { describe, expect, it } from 'vitest';
import { CATEGORIES, PRODUCT_META, productMeta } from '@/components/catalogMeta';
import { loadReferenceData } from '@/lib/data/loader';
import { MAX_LINE_BASE } from '@/lib/engine/index';
import { toBase, unitDimension } from '@/lib/engine/units';

const { catalog } = loadReferenceData();

describe('PRODUCT_META', () => {
  it('has an entry for every catalog item and nothing else', () => {
    expect(Object.keys(PRODUCT_META).sort()).toEqual(catalog.map((c) => c.id).sort());
  });

  it.each(catalog.map((c) => [c.id, c] as const))('%s: stepper unit matches its dimension and one step is a valid quantity', (_id, item) => {
    const meta = PRODUCT_META[item.id]!;
    expect(unitDimension(meta.unit)).toBe(item.dimension);
    const base = toBase(meta.step, meta.unit, item.dimension);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThanOrEqual(MAX_LINE_BASE[item.dimension]);
  });

  it('uses only known categories, and every category has products', () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(CATEGORIES.length);
    for (const meta of Object.values(PRODUCT_META)) expect(ids).toContain(meta.category);
    for (const c of CATEGORIES) {
      expect(Object.values(PRODUCT_META).some((m) => m.category === c.id), c.id).toBe(true);
    }
  });

  it('only points photos at public/products/', () => {
    const images = [...Object.values(PRODUCT_META), ...CATEGORIES].map((m) => m.image).filter(Boolean);
    for (const src of images) expect(src).toMatch(/^\/products\/[a-z0-9-]+\.(webp|jpg|jpeg|png|avif)$/);
  });
});

describe('productMeta', () => {
  it('returns the entry when present', () => {
    expect(productMeta('eggs-large', 'count')).toMatchObject({ emoji: '🥚', unit: 'each', step: 6 });
  });

  it('falls back sensibly for items without an entry', () => {
    expect(productMeta('new-item', 'mass')).toEqual({ category: 'pantry', emoji: '🛒', unit: 'kg', step: 1 });
    expect(productMeta('new-item', 'volume').unit).toBe('L');
    expect(productMeta('new-item', 'count').unit).toBe('each');
  });
});
