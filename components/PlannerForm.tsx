'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { parsePostalCode } from '@/lib/engine/postal';
import type { CatalogItem, PlanResponse, Restriction, Unit } from '@/lib/engine/types';
import { UNITS_FOR } from './format';
import { Hero } from './Hero';
import { PlanResults } from './PlanResults';
import styles from './PlannerForm.module.css';
import { SiteHeader } from './SiteHeader';

export type PlanApiResponse = PlanResponse & { asOf: string };

interface Issue {
  code?: string;
  path?: string;
  itemIndex?: number;
  message: string;
}

interface Row {
  key: number;
  catalogItemId: string;
  quantity: string;
  unit: Unit;
}

interface Props {
  catalog: CatalogItem[];
  restrictions: readonly Restriction[];
  maxItems: number;
}

const SAMPLE: { postalCode: string; items: Omit<Row, 'key'>[] } = {
  postalCode: 'M5V 2T6',
  items: [
    { catalogItemId: 'milk-2pct', quantity: '4', unit: 'L' },
    { catalogItemId: 'eggs-large', quantity: '1', unit: 'dozen' },
    { catalogItemId: 'bananas', quantity: '1', unit: 'kg' },
    { catalogItemId: 'chicken-breast-boneless', quantity: '1', unit: 'kg' },
    { catalogItemId: 'pasta-spaghetti', quantity: '900', unit: 'g' },
    { catalogItemId: 'beans-black-canned', quantity: '1620', unit: 'mL' },
    { catalogItemId: 'apples-gala', quantity: '2', unit: 'lb' },
  ],
};

export function PlannerForm({ catalog, restrictions, maxItems }: Props) {
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const nextKey = useRef(1);

  const [postalCode, setPostalCode] = useState('');
  const [selected, setSelected] = useState<Restriction[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [draftItem, setDraftItem] = useState('');
  const [result, setResult] = useState<PlanApiResponse | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visibleCatalog = query ? catalog.filter((c) => c.name.toLowerCase().includes(query)) : catalog;

  const newRow = (r: Omit<Row, 'key'>): Row => ({ ...r, key: nextKey.current++ });

  function addItem() {
    const item = byId.get(draftItem);
    if (!item || rows.length >= maxItems) return;
    setRows((prev) => [...prev, newRow({ catalogItemId: item.id, quantity: '1', unit: UNITS_FOR[item.dimension][0]! })]);
    setDraftItem('');
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function loadSample() {
    setPostalCode(SAMPLE.postalCode);
    setRows(SAMPLE.items.map(newRow));
    setIssues([]);
    setResult(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Issue[] = [];
    const postal = parsePostalCode(postalCode);
    if (!postal.ok) local.push({ code: 'INVALID_POSTAL_CODE', message: postal.error });
    if (rows.length === 0) local.push({ code: 'EMPTY_LIST', message: 'Add at least one item to your list.' });
    rows.forEach((r, itemIndex) => {
      const q = Number(r.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        local.push({ code: 'INVALID_QUANTITY', itemIndex, message: 'Enter a quantity greater than 0.' });
      }
    });
    if (local.length > 0) {
      setIssues(local);
      return;
    }

    setLoading(true);
    setIssues([]);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postalCode,
          restrictions: selected,
          items: rows.map((r) => ({ catalogItemId: r.catalogItemId, quantity: Number(r.quantity), unit: r.unit })),
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setResult(body as PlanApiResponse);
      } else {
        setResult(null);
        setIssues(Array.isArray(body.issues) && body.issues.length > 0 ? body.issues : [{ message: body.message ?? 'Something went wrong.' }]);
      }
    } catch {
      setResult(null);
      setIssues([{ message: 'Could not reach the server. Check your connection and try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  const rowIssues = (index: number) => issues.filter((i) => i.itemIndex === index);
  const generalIssues = issues.filter((i) => i.itemIndex === undefined);
  const postalIssue = issues.find((i) => i.code === 'INVALID_POSTAL_CODE');

  return (
    <>
      <SiteHeader search={search} onSearch={setSearch} listCount={rows.length} />
      <form className={styles.layout} onSubmit={onSubmit} noValidate>
        <Hero
          postalCode={postalCode}
          onPostalCode={setPostalCode}
          postalError={postalIssue?.message}
          restrictions={restrictions}
          selected={selected}
          onToggleRestriction={(r, on) => setSelected((prev) => (on ? [...prev, r] : prev.filter((x) => x !== r)))}
          onSample={loadSample}
        />

        <div className={styles.form} id="shopping-list">
        <fieldset className={styles.fieldset}>
          <legend>
            Shopping list <span className={styles.muted}>({rows.length}/{maxItems})</span>
          </legend>

          {rows.length > 0 && (
            <ul className={styles.rows}>
              {rows.map((row, index) => {
                const item = byId.get(row.catalogItemId)!;
                const errs = rowIssues(index);
                return (
                  <li key={row.key} className={styles.row}>
                    <span className={styles.rowName} id={`row-${row.key}`}>
                      {item.name}
                    </span>
                    <div className={styles.rowControls}>
                      <input
                        className={`${styles.input} ${styles.qty}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={row.quantity}
                        aria-label={`Quantity of ${item.name}`}
                        aria-invalid={errs.length > 0 ? true : undefined}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      />
                      <select
                        className={styles.input}
                        value={row.unit}
                        aria-label={`Unit for ${item.name}`}
                        onChange={(e) => updateRow(row.key, { unit: e.target.value as Unit })}
                      >
                        {UNITS_FOR[item.dimension].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      >
                        ×
                      </button>
                    </div>
                    {errs.map((err, i) => (
                      <p key={i} className={styles.fieldError}>
                        {err.message}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}

          <div className={styles.addRow}>
            <label htmlFor="add-item" className="visually-hidden">
              Item to add
            </label>
            <select
              id="add-item"
              className={`${styles.input} ${styles.addSelect}`}
              value={draftItem}
              onChange={(e) => setDraftItem(e.target.value)}
            >
              <option value="">{query ? `Choose an item (${visibleCatalog.length} match${visibleCatalog.length === 1 ? '' : 'es'})…` : 'Choose an item…'}</option>
              {visibleCatalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className={styles.secondary} onClick={addItem} disabled={!draftItem || rows.length >= maxItems}>
              Add
            </button>
          </div>
        </fieldset>

        {generalIssues.filter((i) => i !== postalIssue).length > 0 && (
          <div className={styles.errorBox} role="alert">
            {generalIssues
              .filter((i) => i !== postalIssue)
              .map((i, n) => (
                <p key={n}>{i.message}</p>
              ))}
          </div>
        )}

        <button type="submit" className={styles.primary} disabled={loading}>
          {loading ? 'Finding the best prices…' : 'Find the cheapest trip'}
        </button>
        </div>
      </form>

      <div aria-live="polite">{result && <PlanResults response={result} catalog={byId} />}</div>
    </>
  );
}
