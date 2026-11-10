'use client';

import styles from './SiteHeader.module.css';

interface Props {
  search: string;
  onSearch: (value: string) => void;
  listCount: number;
}

/** Top bar: brand, product search and a shortcut to the shopping list. */
export function SiteHeader({ search, onSearch, listCount }: Props) {
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="/">
        <span className={styles.logo} aria-hidden="true">
          🛒
        </span>
        <span>Sale Optimizer</span>
      </a>

      <div className={styles.search} role="search">
        <label htmlFor="product-search" className="visually-hidden">
          Search products
        </label>
        <svg className={styles.searchIcon} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m13 13 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id="product-search"
          type="search"
          className={styles.searchInput}
          placeholder="Search milk, eggs, chicken…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          autoComplete="off"
        />
      </div>

      <a className={styles.list} href="#shopping-list" aria-label={`Shopping list, ${listCount} item${listCount === 1 ? '' : 's'}`}>
        <span aria-hidden="true">🧺</span>
        <span className={styles.count}>{listCount}</span>
      </a>
    </header>
  );
}
