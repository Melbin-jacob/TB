import type { CatalogIndex } from './ingest';
import type { CatalogItem, DietaryStatus, Ingredient, NormalizedListing, Restriction } from './types';

/**
 * Dietary filtering — three outcomes per listing:
 *   ok         the listing positively claims every selected restriction
 *   unverified no evidence either way (still usable, flagged in the UI)
 *   excluded   known conflict (never used)
 *
 * Evidence, strongest first, evaluated per selected restriction:
 *   1. the listing's own `contains` lists a forbidden ingredient → excluded
 *      (a self-contradictory listing, e.g. tagged vegan but containing dairy, is excluded: safety first)
 *   2. the listing carries the restriction tag (directly or implied)  → ok
 *   3. the catalog item inherently contains a forbidden ingredient → excluded
 *      (listing-level tags override catalog defaults, e.g. gluten-free pasta)
 *   4. otherwise → unverified
 * The overall status is the worst across restrictions: excluded > unverified > ok.
 */

/** Ingredients each restriction rules out. */
export const RESTRICTION_EXCLUDES: Readonly<Record<Restriction, readonly Ingredient[]>> = {
  vegan: ['meat', 'pork', 'poultry', 'fish', 'shellfish', 'dairy', 'eggs', 'honey'],
  vegetarian: ['meat', 'pork', 'poultry', 'fish', 'shellfish'],
  'gluten-free': ['gluten'],
  'dairy-free': ['dairy'],
  'nut-free': ['nuts'],
  halal: ['pork', 'alcohol'],
  kosher: ['pork', 'shellfish'],
};

/** Tags that logically imply other tags (a vegan product is necessarily vegetarian and dairy-free). */
export const TAG_IMPLIES: Readonly<Partial<Record<Restriction, readonly Restriction[]>>> = {
  vegan: ['vegetarian', 'dairy-free'],
};

export interface ListingAssessment {
  status: DietaryStatus | 'excluded';
  /** Human-readable explanation per restriction that was excluded or unverified (empty when ok). */
  reasons: string[];
}

export interface FilteredListings {
  eligible: { listing: NormalizedListing; dietary: DietaryStatus }[];
  excluded: { listing: NormalizedListing; reasons: string[] }[];
}

export interface CatalogConflict {
  catalogItemId: string;
  restriction: Restriction;
  ingredients: Ingredient[];
  message: string;
}

function effectiveTags(tags: readonly Restriction[]): Set<Restriction> {
  const out = new Set<Restriction>(tags);
  for (const tag of tags) for (const implied of TAG_IMPLIES[tag] ?? []) out.add(implied);
  return out;
}

function forbiddenIn(ingredients: readonly Ingredient[], restriction: Restriction): Ingredient[] {
  const forbidden = RESTRICTION_EXCLUDES[restriction];
  return ingredients.filter((i) => forbidden.includes(i));
}

/** Assesses one listing against the selected restrictions. No restrictions → always ok. */
export function assessListing(
  listing: NormalizedListing,
  catalogItem: CatalogItem | undefined,
  restrictions: readonly Restriction[],
): ListingAssessment {
  const tags = effectiveTags(listing.tags);
  const excludedReasons: string[] = [];
  const unverifiedReasons: string[] = [];

  for (const restriction of new Set(restrictions)) {
    const ownConflict = forbiddenIn(listing.contains, restriction);
    if (ownConflict.length > 0) {
      excludedReasons.push(`${restriction}: listing contains ${ownConflict.join(', ')}`);
      continue;
    }
    if (tags.has(restriction)) continue;

    const catalogConflict = forbiddenIn(catalogItem?.inherentContains ?? [], restriction);
    if (catalogConflict.length > 0) {
      excludedReasons.push(`${restriction}: ${catalogItem?.name ?? listing.catalogItemId} normally contains ${catalogConflict.join(', ')}`);
      continue;
    }
    unverifiedReasons.push(`${restriction}: not confirmed by the flyer`);
  }

  if (excludedReasons.length > 0) return { status: 'excluded', reasons: excludedReasons };
  if (unverifiedReasons.length > 0) return { status: 'unverified', reasons: unverifiedReasons };
  return { status: 'ok', reasons: [] };
}

/** Splits listings into usable (ok / unverified) and excluded. Order is preserved. */
export function filterListings(
  listings: readonly NormalizedListing[],
  catalog: CatalogIndex,
  restrictions: readonly Restriction[],
): FilteredListings {
  const result: FilteredListings = { eligible: [], excluded: [] };
  for (const listing of listings) {
    const assessment = assessListing(listing, catalog.get(listing.catalogItemId), restrictions);
    if (assessment.status === 'excluded') {
      result.excluded.push({ listing, reasons: assessment.reasons });
    } else {
      result.eligible.push({ listing, dietary: assessment.status });
    }
  }
  return result;
}

/**
 * Catalog-level warnings: shopping-list items whose type normally conflicts with a selected restriction
 * (e.g. "Chicken thighs" with vegan). Listings explicitly tagged for the restriction may still qualify.
 */
export function catalogConflicts(
  items: readonly CatalogItem[],
  restrictions: readonly Restriction[],
): CatalogConflict[] {
  const conflicts: CatalogConflict[] = [];
  for (const item of items) {
    for (const restriction of new Set(restrictions)) {
      const ingredients = forbiddenIn(item.inherentContains, restriction);
      if (ingredients.length > 0) {
        conflicts.push({
          catalogItemId: item.id,
          restriction,
          ingredients,
          message: `${item.name} normally contains ${ingredients.join(', ')}, which conflicts with ${restriction}. Only listings labelled ${restriction} will be used.`,
        });
      }
    }
  }
  return conflicts;
}
