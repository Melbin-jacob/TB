import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('toolchain smoke test', () => {
  it('runs TypeScript tests with Zod available', () => {
    const Cents = z.number().int().nonnegative();
    expect(Cents.parse(499)).toBe(499);
    expect(Cents.safeParse(4.99).success).toBe(false);
  });
});
