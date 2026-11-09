import { isoDateSchema } from '@/lib/engine/schemas';
import type { IsoDate } from '@/lib/engine/types';

/** Flyers are weekly and local, so "today" is evaluated in Toronto time. */
export const PLANNING_TIME_ZONE = 'America/Toronto';

/** Calendar date (YYYY-MM-DD) of `now` in the given IANA time zone. */
export function isoDateIn(now: Date, timeZone: string = PLANNING_TIME_ZONE): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Date used to pick active flyers, by precedence:
 *   1. `requested` (the request body's asOf),
 *   2. `demoAsOf` (the DEMO_AS_OF environment variable) — keeps the fixed mock week usable,
 *   3. today in Toronto.
 * An invalid DEMO_AS_OF is ignored with a warning rather than breaking every request.
 */
export function resolveAsOf(requested: IsoDate | undefined, demoAsOf: string | undefined, now: Date = new Date()): IsoDate {
  if (requested) return requested;
  if (demoAsOf) {
    if (isoDateSchema.safeParse(demoAsOf).success) return demoAsOf;
    console.warn(`[asOf] ignoring invalid DEMO_AS_OF="${demoAsOf}" (expected YYYY-MM-DD)`);
  }
  return isoDateIn(now);
}
