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
      <PlannerForm catalog={sorted} restrictions={RESTRICTIONS} maxItems={MAX_LIST_LINES} />
    </main>
  );
}
