import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { indexCatalog, ingestFlyers, type CatalogIndex, type FlyerStatus } from '@/lib/engine/ingest';
import { catalogSchema, describeIssues, storesSchema } from '@/lib/engine/schemas';
import type { CatalogItem, IsoDate, NormalizedListing, Rejection, Store } from '@/lib/engine/types';

/**
 * Server-only data access for the mock data under `data/`.
 *
 * - Reference data (catalog, stores) is authored by us: if it is invalid we fail loudly.
 * - Flyers are untrusted input: bad listings are rejected and logged, bad flyers are skipped.
 */

export const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

export interface ReferenceData {
  catalog: CatalogItem[];
  catalogIndex: CatalogIndex;
  stores: Store[];
}

export interface MarketData extends ReferenceData {
  listings: NormalizedListing[];
  rejections: Rejection[];
  warnings: string[];
  flyers: { file: string; storeId: string | null; status: FlyerStatus }[];
}

export class DataLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataLoadError';
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

/** Loads and validates the catalog and store list. Throws DataLoadError on any problem. */
export function loadReferenceData(dataDir: string = DEFAULT_DATA_DIR): ReferenceData {
  const load = <T>(file: string, schema: z.ZodType<T>): T => {
    const full = path.join(dataDir, file);
    let raw: unknown;
    try {
      raw = readJson(full);
    } catch (e) {
      throw new DataLoadError(`cannot read ${file}: ${(e as Error).message}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new DataLoadError(`${file} is invalid: ${describeIssues(parsed.error)}`);
    }
    return parsed.data;
  };

  const catalog: CatalogItem[] = load('catalog.json', catalogSchema);
  const stores: Store[] = load('stores.json', storesSchema);
  return { catalog, catalogIndex: indexCatalog(catalog), stores };
}

/**
 * Loads reference data plus every `data/flyers/*.json` flyer that is active on `asOf`.
 * Unreadable flyer files and flyers for unknown stores are skipped with a warning.
 */
export function loadMarketData(asOf: IsoDate, dataDir: string = DEFAULT_DATA_DIR): MarketData {
  const ref = loadReferenceData(dataDir);
  const storeIds = new Set(ref.stores.map((s) => s.id));
  const flyerDir = path.join(dataDir, 'flyers');

  let files: string[];
  try {
    files = readdirSync(flyerDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch (e) {
    throw new DataLoadError(`cannot read flyer directory: ${(e as Error).message}`);
  }

  const result: MarketData = { ...ref, listings: [], rejections: [], warnings: [], flyers: [] };

  for (const file of files) {
    let raw: unknown;
    try {
      raw = readJson(path.join(flyerDir, file));
    } catch (e) {
      result.warnings.push(`Flyer file "${file}" could not be read and was skipped: ${(e as Error).message}`);
      continue;
    }

    const one = ingestFlyers([raw], ref.catalogIndex, asOf);
    const flyer = one.flyers[0] ?? { storeId: null, status: 'invalid' as const };

    if (flyer.storeId !== null && !storeIds.has(flyer.storeId)) {
      result.warnings.push(`Flyer file "${file}" is for unknown store "${flyer.storeId}" and was skipped.`);
      result.flyers.push({ file, storeId: flyer.storeId, status: 'invalid' });
      continue;
    }

    result.flyers.push({ file, ...flyer });
    result.warnings.push(...one.warnings);
    result.rejections.push(...one.rejections);
    result.listings.push(...one.listings);
  }

  const active = new Map<string, number>();
  for (const f of result.flyers) {
    if (f.status === 'active' && f.storeId) active.set(f.storeId, (active.get(f.storeId) ?? 0) + 1);
  }
  for (const [storeId, count] of active) {
    if (count > 1) {
      result.warnings.push(`Store "${storeId}" has ${count} active flyers; listings from all of them are used.`);
    }
  }

  if (result.rejections.length > 0) {
    console.warn(
      `[loader] ${result.rejections.length} flyer listing(s) rejected:\n` +
        result.rejections.map((r) => `  - ${r.storeId}/${r.listingId} ${r.reason}: ${r.detail}`).join('\n'),
    );
  }
  return result;
}
