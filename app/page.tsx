import { PlannerForm } from '@/components/PlannerForm';
import { loadReferenceData } from '@/lib/data/loader';
import { MAX_LIST_LINES } from '@/lib/engine/index';
import { RESTRICTIONS } from '@/lib/engine/schemas';
import styles from './page.module.css';

export const dynamic = 'force-dynamic'; // read data/ at request time so edits show up without a rebuild

export default function HomePage() {
  const { catalog } = loadReferenceData();
  const sorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={styles.main}>
      <div className={styles.intro}>
        <h1>Grocery Sale Optimizer</h1>
        <p>
          Enter your postal code and shopping list. We compare this week&rsquo;s flyer prices nearby and show the cheapest
          trip to one store, and to two.
        </p>
      </div>
      <PlannerForm catalog={sorted} restrictions={RESTRICTIONS} maxItems={MAX_LIST_LINES} />
    </main>
  );
}
