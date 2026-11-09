/**
 * Canadian postal codes: "A1A 1A1".
 * - Letters D, F, I, O, Q, U never appear.
 * - W and Z never appear in the first position.
 * The first three characters are the forward sortation area (FSA), used for store coverage.
 */
const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

export type PostalResult =
  | { ok: true; postalCode: string; fsa: string }
  | { ok: false; error: string };

/** Validates and normalizes a Canadian postal code (case-insensitive; spaces/hyphens ignored). */
export function parsePostalCode(input: string): PostalResult {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, '');
  if (compact.length === 0) {
    return { ok: false, error: 'Postal code is required.' };
  }
  if (!POSTAL_RE.test(compact)) {
    return { ok: false, error: `"${input.trim()}" is not a valid Canadian postal code (format A1A 1A1).` };
  }
  return { ok: true, postalCode: `${compact.slice(0, 3)} ${compact.slice(3)}`, fsa: compact.slice(0, 3) };
}
