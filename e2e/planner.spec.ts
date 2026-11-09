import { expect, test, type Page } from '@playwright/test';

/**
 * Planner end-to-end tests. Prices come from data/flyers with DEMO_AS_OF=2026-11-09
 * (set in playwright.config.ts) and match the engine tests in tests/engine/optimizer.test.ts.
 */

const findTrip = (page: Page) => page.getByRole('button', { name: 'Find the cheapest trip' }).click();

async function addItem(page: Page, catalogItemId: string) {
  await page.getByLabel('Item to add').selectOption(catalogItemId);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

async function planSample(page: Page, options: { postal?: string; restrictions?: string[] } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample list' }).click();
  if (options.postal) await page.getByLabel('Postal code').fill(options.postal);
  for (const r of options.restrictions ?? []) await page.getByLabel(r).check();
  await findTrip(page);
  await expect(page.getByRole('heading', { name: /Your plan for/ })).toBeVisible();
}

test.describe('planner', () => {
  let pageErrors: string[] = [];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
  });

  test.afterEach(() => {
    expect(pageErrors, 'uncaught errors in the page').toEqual([]);
  });

  test('shows the best single store, the best two stores and the saving', async ({ page }) => {
    await planSample(page);

    const [single, pair] = [page.locator('article').nth(0), page.locator('article').nth(1)];
    await expect(single).toContainText('Best single store');
    await expect(single).toContainText('Maple Basket Market');
    await expect(single).toContainText('$32.20');
    await expect(single).toContainText('All 7 items');
    await expect(single).toContainText('1 × Maple Valley 2% Milk 4 L');
    await expect(single).toContainText('$1.48/L');
    await expect(single).toContainText('3 × Black Beans 540 mL (multi-buy deal)');

    await expect(pair).toContainText('Maple Basket Market + ValuCart');
    await expect(pair).toContainText('$31.28');
    await expect(pair).toContainText('Saves $0.92 vs one store');
    await expect(page.getByText('Prices from flyers valid on Nov 9, 2026')).toBeVisible();
  });

  test('charges whole packs and shows the over-buy', async ({ page }) => {
    // Smallest basmati rice bag in M6K is 2 kg
    await page.goto('/');
    await page.getByLabel('Postal code').fill('M6K 1A1');
    await addItem(page, 'rice-basmati');
    await findTrip(page);
    const single = page.locator('article').first();
    await expect(single).toContainText('buys 2 kg, you need 1 kg');
    await expect(single).toContainText('All 1 item');
  });

  test('validates input before calling the server', async ({ page }) => {
    await page.goto('/');
    await findTrip(page);
    await expect(page.locator('#postal-error')).toHaveText('Postal code is required.');
    await expect(page.getByText('Add at least one item to your list.')).toBeVisible();

    await page.getByRole('button', { name: 'Try a sample list' }).click();
    await page.getByLabel('Postal code').fill('90210');
    await findTrip(page);
    await expect(page.locator('#postal-error')).toContainText('not a valid Canadian postal code');
  });

  test('shows server-side errors next to the item', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample list' }).click();
    await page.getByLabel('Quantity of Milk, 2%').fill('30');
    await findTrip(page);
    await expect(page.getByText('Milk, 2%: at most 25 L per item.')).toBeVisible();
  });

  test('explains when no store covers the area', async ({ page }) => {
    await planSample(page, { postal: 'V6B 1A1' });
    await expect(page.getByText('No stores in our coverage area yet for V6B.')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
  });

  test('applies dietary restrictions', async ({ page }) => {
    await planSample(page, { restrictions: ['Vegan'] });
    const results = page.locator('section');
    await expect(results).toContainText('Milk, 2% normally contains dairy, which conflicts with vegan.');
    await expect(results).toContainText('Not available');

    await planSample(page, { restrictions: ['Nut-free'] });
    await expect(page.getByText('unverified', { exact: true }).first()).toBeVisible();
  });

  test('lists items no nearby store carries', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample list' }).click();
    await addItem(page, 'lentils-red');
    await findTrip(page);
    await expect(page.getByText('Lentils, red split is not available at any store near you this week.')).toBeVisible();
    await expect(page.locator('article').first()).toContainText('1 item unavailable');
  });

  test('fits the screen without horizontal scrolling', async ({ page }) => {
    await planSample(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
