import type { CatalogItem, NormalizedListing, Plan, PlanLine, Store } from '@/lib/engine/types';
import { formatCents } from '@/lib/engine/money';
import { formatAmount, formatIsoDate, formatUnitPrice } from './format';
import type { PlanApiResponse } from './PlannerForm';
import styles from './PlanResults.module.css';

interface Props {
  response: PlanApiResponse;
  catalog: ReadonlyMap<string, CatalogItem>;
}

interface Lookups {
  catalog: ReadonlyMap<string, CatalogItem>;
  listings: ReadonlyMap<string, NormalizedListing>;
  stores: ReadonlyMap<string, Store>;
}

export function PlanResults({ response, catalog }: Props) {
  const lookups: Lookups = {
    catalog,
    listings: new Map(response.listings.map((l) => [l.listingId, l])),
    stores: new Map(response.stores.map((s) => [s.id, s])),
  };
  const { bestSingle, bestPair, pairSavingsCents } = response;

  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <header className={styles.header}>
        <h2 id="results-heading">Your plan for {response.area}</h2>
        <p className={styles.muted}>
          Prices from flyers valid on {formatIsoDate(response.asOf)}
          {response.stores.length > 0 && <> · {response.stores.length} stores nearby</>}
        </p>
      </header>

      {response.warnings.length > 0 && (
        <ul className={styles.warnings} aria-label="Notes">
          {response.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {(bestSingle || bestPair) && (
        <div className={styles.grid}>
          {bestSingle && <PlanCard title="Best single store" plan={bestSingle} lookups={lookups} showStorePerLine={false} />}
          {bestPair && (
            <PlanCard
              title="Best two stores"
              plan={bestPair}
              lookups={lookups}
              showStorePerLine
              comparison={pairComparison(pairSavingsCents, bestSingle, bestPair)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function pairComparison(savings: number | null, single: Plan | null, pair: Plan): { text: string; good: boolean } | undefined {
  if (!single) return undefined;
  if (savings === null) {
    return pair.lines.length > single.lines.length
      ? { text: `Covers ${pair.lines.length - single.lines.length} more item(s) than any single store`, good: true }
      : undefined;
  }
  if (savings > 0) return { text: `Saves ${formatCents(savings)} vs one store`, good: true };
  if (savings < 0) return { text: `Costs ${formatCents(-savings)} more than one store`, good: false };
  return { text: 'Same price as one store', good: false };
}

function PlanCard({
  title,
  plan,
  lookups,
  showStorePerLine,
  comparison,
}: {
  title: string;
  plan: Plan;
  lookups: Lookups;
  showStorePerLine: boolean;
  comparison?: { text: string; good: boolean } | undefined;
}) {
  const storeNames = plan.storeIds.map((id) => lookups.stores.get(id)?.name ?? id);
  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.stores}>{storeNames.join(' + ')}</p>
      <p className={styles.total}>
        {formatCents(plan.totalCents)}
        {plan.savingsVsRegularCents > 0 && <span className={styles.saving}> saves {formatCents(plan.savingsVsRegularCents)} vs regular</span>}
      </p>
      {comparison && <p className={comparison.good ? styles.compareGood : styles.compareBad}>{comparison.text}</p>}
      <p className={styles.badges}>
        {plan.complete ? (
          <span className={styles.badgeOk}>All {plan.lines.length} items</span>
        ) : (
          <span className={styles.badgeWarn}>
            {plan.unavailable.length} item{plan.unavailable.length === 1 ? '' : 's'} unavailable
          </span>
        )}
        {plan.unverifiedCount > 0 && <span className={styles.badgeWarn}>{plan.unverifiedCount} unverified for your diet</span>}
      </p>

      {plan.storeIds.map((storeId) => {
        const lines = plan.lines.filter((l) => l.storeId === storeId);
        if (lines.length === 0) return null;
        const subtotal = lines.reduce((s, l) => s + l.costCents, 0);
        return (
          <div key={storeId} className={styles.storeGroup}>
            {(showStorePerLine || plan.storeIds.length > 1) && (
              <h4 className={styles.storeHeading}>
                <span>{lookups.stores.get(storeId)?.name ?? storeId}</span>
                <span>{formatCents(subtotal)}</span>
              </h4>
            )}
            <ul className={styles.lines}>
              {lines.map((line) => (
                <LineItem key={line.catalogItemId} line={line} lookups={lookups} />
              ))}
            </ul>
          </div>
        );
      })}

      {plan.unavailable.length > 0 && (
        <div className={styles.unavailable}>
          <h4>Not available</h4>
          <ul>
            {plan.unavailable.map((id) => (
              <li key={id}>{lookups.catalog.get(id)?.name ?? id}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function LineItem({ line, lookups }: { line: PlanLine; lookups: Lookups }) {
  const item = lookups.catalog.get(line.catalogItemId);
  const dimension = item?.dimension ?? 'count';
  const displayUnit = item?.displayUnit ?? 'each';

  const parts: string[] = line.packs.map((p) => {
    const title = lookups.listings.get(p.listingId)?.title ?? p.listingId;
    return `${p.count} × ${title}${p.bundles > 0 ? ` (${p.bundles === 1 ? 'multi-buy deal' : `${p.bundles} multi-buy deals`})` : ''}`;
  });
  if (line.loose) {
    const title = lookups.listings.get(line.loose.listingId)?.title ?? line.loose.listingId;
    parts.push(`${formatAmount(line.loose.base, dimension)}${dimension === 'count' ? ' ×' : ' of'} ${title}`);
  }
  const unitPrices = line.listingIds
    .map((id) => lookups.listings.get(id))
    .filter((l): l is NormalizedListing => Boolean(l))
    .map((l) => formatUnitPrice(l.pricePerDisplayUnit, displayUnit));
  const overbuy = line.purchasedBase > line.neededBase;

  return (
    <li className={styles.line}>
      <div className={styles.lineMain}>
        <span className={styles.lineName}>
          {item?.name ?? line.catalogItemId}
          {line.dietary === 'unverified' && (
            <span className={styles.unverified} title="The flyer does not confirm this item meets your dietary needs.">
              unverified
            </span>
          )}
        </span>
        <span className={styles.lineCost}>{formatCents(line.costCents)}</span>
      </div>
      <p className={styles.lineDetail}>{parts.join(' + ')}</p>
      <p className={styles.lineMeta}>
        {[...new Set(unitPrices)].join(', ')}
        {overbuy && (
          <>
            {' · '}
            buys {formatAmount(line.purchasedBase, dimension)}, you need {formatAmount(line.neededBase, dimension)}
          </>
        )}
      </p>
    </li>
  );
}
