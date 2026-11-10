'use client';

import type { Restriction } from '@/lib/engine/types';
import styles from './Hero.module.css';

const RESTRICTION_LABELS: Record<Restriction, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  'dairy-free': 'Dairy-free',
  'nut-free': 'Nut-free',
  halal: 'Halal',
  kosher: 'Kosher',
};

interface Props {
  postalCode: string;
  onPostalCode: (value: string) => void;
  postalError?: string | undefined;
  restrictions: readonly Restriction[];
  selected: readonly Restriction[];
  onToggleRestriction: (restriction: Restriction, on: boolean) => void;
  onSample: () => void;
}

/** Hero banner: headline, postal code, dietary needs and the sample-list shortcut. */
export function Hero({ postalCode, onPostalCode, postalError, restrictions, selected, onToggleRestriction, onSample }: Props) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.content}>
        <h1 id="hero-title" className={styles.title}>
          Shop the sales,
          <br />
          not every store
        </h1>
        <p className={styles.lede}>
          We compare this week&rsquo;s flyer prices near you and find the cheapest trip to one store, or two.
        </p>

        <div className={styles.postalRow}>
          <div className={styles.field}>
            <label htmlFor="postal" className={styles.label}>
              Postal code
            </label>
            <input
              id="postal"
              className={styles.postal}
              value={postalCode}
              onChange={(e) => onPostalCode(e.target.value)}
              placeholder="M5V 2T6"
              autoComplete="postal-code"
              aria-invalid={postalError ? true : undefined}
              aria-describedby={postalError ? 'postal-error' : undefined}
            />
          </div>
          <button type="button" className={styles.sample} onClick={onSample}>
            Try a sample list
          </button>
        </div>
        {postalError && (
          <p id="postal-error" className={styles.error}>
            {postalError}
          </p>
        )}

        <fieldset className={styles.diet}>
          <legend className={styles.label}>Dietary needs (optional)</legend>
          <div className={styles.chips}>
            {restrictions.map((r) => (
              <label key={r} className={styles.chip}>
                <input type="checkbox" checked={selected.includes(r)} onChange={(e) => onToggleRestriction(r, e.target.checked)} />
                <span>{RESTRICTION_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={styles.art} aria-hidden="true">
        <span className={styles.basket}>🧺</span>
        <span className={`${styles.float} ${styles.f1}`}>🥦</span>
        <span className={`${styles.float} ${styles.f2}`}>🍎</span>
        <span className={`${styles.float} ${styles.f3}`}>🥛</span>
        <span className={`${styles.float} ${styles.f4}`}>🥖</span>
        <span className={`${styles.float} ${styles.f5}`}>🧀</span>
        <span className={styles.tag}>This week&rsquo;s flyers</span>
      </div>
    </section>
  );
}
