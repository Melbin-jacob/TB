import { z } from 'zod';
import { MAX_LIST_LINES } from './index';
import { isoDateSchema, RESTRICTIONS, UNIT_VALUES } from './schemas';

/**
 * Shape check for POST /api/plan bodies. Business rules (postal code format, known catalog items,
 * unit/dimension match, per-line limits) are enforced by planShopping() so they apply to every caller.
 */
export const planRequestSchema = z.strictObject({
  postalCode: z.string().max(20),
  restrictions: z.array(z.enum(RESTRICTIONS)).max(20).default([]),
  items: z
    .array(
      z.strictObject({
        catalogItemId: z.string().min(1).max(100),
        quantity: z.number().finite().positive(),
        unit: z.enum(UNIT_VALUES),
      }),
    )
    .max(MAX_LIST_LINES, `A list can have at most ${MAX_LIST_LINES} items.`),
  /** Optional date override (YYYY-MM-DD) for testing and demos. */
  asOf: isoDateSchema.optional(),
});

export type PlanRequestBody = z.infer<typeof planRequestSchema>;
