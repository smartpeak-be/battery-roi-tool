// e2e/tests/product-specs.spec.js
// E2E tests for product specs feature on producten-beheer.html
import { test, expect } from '../helpers/auth-fixture.js';
import { firebaseSignIn } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';

/**
 * Helper: navigate to producten-beheer.html, authenticate, and wait until
 * the page is fully initialized (settings + categories + products loaded).
 */
async function navigateAndWaitReady(page) {
  await page.goto('/producten-beheer.html');
  await firebaseSignIn(page);

  await page.waitForSelector('#stateAuthorized', {
    state: 'visible',
    timeout: 15_000,
  });

  await page.waitForFunction(
    () => document.getElementById('stateAuthorized')?.dataset.ready === 'true',
    { timeout: 15_000 },
  );
}

/**
 * Helper: get the Batterijen category ID via Admin SDK.
 */
async function getBatterijenCategoryId() {
  const db = getAdminFirestore();
  const snap = await db.collection('productCategories')
    .where('slug', '==', 'batterijen')
    .limit(1)
    .get();
  if (snap.empty) throw new Error('batterijen category not found');
  return snap.docs[0].id;
}

/**
 * Helper: get the Omvormers category ID via Admin SDK.
 */
async function getOmvormersCategoryId() {
  const db = getAdminFirestore();
  const snap = await db.collection('productCategories')
    .where('slug', '==', 'omvormers')
    .limit(1)
    .get();
  if (snap.empty) throw new Error('omvormers category not found');
  return snap.docs[0].id;
}

/**
 * Helper: create a test product via Admin SDK (for tests that need a pre-existing product).
 * Returns the product ID and full document.
 */
async function createTestProductAdmin(overrides = {}) {
  const db = getAdminFirestore();
  const batterijenId = await getBatterijenCategoryId();
  const doc = {
    categoryId: batterijenId,
    brand: 'Marstek',
    model: `E2E_Spec_${Date.now()}`,
    description: 'E2E spec test product',
    purchasePrice: 1000,
    marginType: 'percent',
    marginValue: 30,
    discountType: 'percent',
    discountValue: 10,
    discountFromUnit: 2,
    isActive: true,
    sortOrder: 0,
    specs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'e2e-test',
    ...overrides,
  };
  const ref = await db.collection('products').add(doc);
  return { id: ref.id, ...doc };
}

test.describe('Product Specs', () => {
  // Cleanup after each test
  test.afterEach(async () => {
    const db = getAdminFirestore();
    // Clean up all E2E_Spec_ test products
    const snap = await db.collection('products').get();
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.model && data.model.startsWith('E2E_Spec_')) {
        batch.delete(d.ref);
        count++;
      }
    });
    if (count > 0) await batch.commit();
  });

  test('battery specs visible', async ({ page }) => {
    // Create product in batterijen category
    const product = await createTestProductAdmin();

    await navigateAndWaitReady(page);

    // Click the test product card to open detail
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    // Wait for detail form
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Verify battery-specific specs are visible
    const container = page.locator('#productDetailBody');

    const capacityField = container.locator('.spec-field[data-spec-key="capacityKwh"]');
    await expect(capacityField).toBeVisible();

    const chemistryField = container.locator('.spec-field[data-spec-key="chemistry"]');
    await expect(chemistryField).toBeVisible();

    // Verify inverter-only spec is NOT visible
    const inverterPowerField = container.locator('.spec-field[data-spec-key="inverterPowerKw"]');
    await expect(inverterPowerField).not.toBeVisible();
  });

  test('category switch re-renders specs', async ({ page }) => {
    // Create product in batterijen category
    const product = await createTestProductAdmin();
    const omvormersId = await getOmvormersCategoryId();

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    const container = page.locator('#productDetailBody');

    // Verify capacityKwh is visible (batterijen category)
    await expect(container.locator('.spec-field[data-spec-key="capacityKwh"]')).toBeVisible();

    // Switch category dropdown to omvormers
    await page.selectOption('.detail-category', omvormersId);

    // Wait a moment for re-render
    await page.waitForTimeout(300);

    // Verify inverterPowerKw is now visible
    await expect(container.locator('.spec-field[data-spec-key="inverterPowerKw"]')).toBeVisible();

    // Verify capacityKwh is gone
    await expect(container.locator('.spec-field[data-spec-key="capacityKwh"]')).not.toBeVisible();
  });

  test('spec values persist on save', async ({ page }) => {
    // Create product in batterijen category (via Admin SDK without specs)
    const product = await createTestProductAdmin();

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    const container = page.locator('#productDetailBody');

    // Fill capacityKwh = 10.24
    const capacityField = container.locator('.spec-field[data-spec-key="capacityKwh"]');
    await capacityField.fill('10.24');

    // Select chemistry = LiFePO4
    const chemistryField = container.locator('.spec-field[data-spec-key="chemistry"]');
    await chemistryField.selectOption('LiFePO4');

    // Check selfHeating checkbox
    const selfHeatingField = container.locator('.spec-field[data-spec-key="selfHeating"]');
    await selfHeatingField.check();

    // Click save
    await page.click('.detail-btn-save');

    // Wait for success toast
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('bijgewerkt'));
      },
      { timeout: 10_000 },
    );

    // Reload page
    await page.reload();
    await navigateAndWaitReady(page);

    // Navigate to same product
    const cardAfterReload = page.locator('.product-card', { hasText: product.model });
    await cardAfterReload.waitFor({ state: 'visible', timeout: 10_000 });
    await cardAfterReload.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    const containerAfter = page.locator('#productDetailBody');

    // Verify capacityKwh = 10.24
    const capacityAfter = containerAfter.locator('.spec-field[data-spec-key="capacityKwh"]');
    await expect(capacityAfter).toHaveValue('10.24');

    // Verify chemistry = LiFePO4
    const chemistryAfter = containerAfter.locator('.spec-field[data-spec-key="chemistry"]');
    await expect(chemistryAfter).toHaveValue('LiFePO4');

    // Verify selfHeating is checked
    const selfHeatingAfter = containerAfter.locator('.spec-field[data-spec-key="selfHeating"]');
    await expect(selfHeatingAfter).toBeChecked();
  });

  test('custom spec add + persist', async ({ page }) => {
    // Create product in batterijen category
    const product = await createTestProductAdmin();

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Click add custom spec button
    await page.click('.btn-add-custom-spec');

    // Wait for new custom spec row to appear
    await page.waitForSelector('.custom-spec-row', { timeout: 2000 });

    // Fill key="Kleur", value="Zwart"
    const customSpecRows = page.locator('.custom-spec-row');
    const firstRow = customSpecRows.first();
    await firstRow.locator('.custom-spec-key').fill('Kleur');
    await firstRow.locator('.custom-spec-value').fill('Zwart');

    // Click save
    await page.click('.detail-btn-save');

    // Wait for success toast
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('bijgewerkt'));
      },
      { timeout: 10_000 },
    );

    // Reload page
    await page.reload();
    await navigateAndWaitReady(page);

    // Navigate to same product
    const cardAfterReload = page.locator('.product-card', { hasText: product.model });
    await cardAfterReload.waitFor({ state: 'visible', timeout: 10_000 });
    await cardAfterReload.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Verify custom spec row exists with key="Kleur" and value="Zwart"
    const customRowAfter = page.locator('.custom-spec-row').first();
    await expect(customRowAfter.locator('.custom-spec-key')).toHaveValue('Kleur');
    await expect(customRowAfter.locator('.custom-spec-value')).toHaveValue('Zwart');
  });

  test('custom spec delete + persist', async ({ page }) => {
    // Create product in batterijen category WITH specs.custom = {Kleur: "Zwart", Gewicht: "25kg"}
    const product = await createTestProductAdmin({
      specs: {
        custom: {
          Kleur: 'Zwart',
          Gewicht: '25kg',
        },
      },
    });

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Verify 2 custom spec rows exist
    const customRows = page.locator('.custom-spec-row');
    await expect(customRows).toHaveCount(2);

    // Click delete on the first row
    const firstRow = customRows.first();
    await firstRow.locator('.btn-delete-custom-spec').click();

    // Verify only 1 row remains (in DOM, before save)
    await expect(page.locator('.custom-spec-row')).toHaveCount(1);

    // Click save
    await page.click('.detail-btn-save');

    // Wait for success toast
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('bijgewerkt'));
      },
      { timeout: 10_000 },
    );

    // Reload page
    await page.reload();
    await navigateAndWaitReady(page);

    // Navigate to same product
    const cardAfterReload = page.locator('.product-card', { hasText: product.model });
    await cardAfterReload.waitFor({ state: 'visible', timeout: 10_000 });
    await cardAfterReload.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Verify only 1 custom spec row remains (persisted)
    const customRowsAfter = page.locator('.custom-spec-row');
    await expect(customRowsAfter).toHaveCount(1);
  });
});
