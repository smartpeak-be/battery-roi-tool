// e2e/tests/product-crud-products.spec.js
// E2E tests for product CRUD operations on producten-beheer.html
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
    .where('name', '==', 'Batterijen')
    .limit(1)
    .get();
  if (snap.empty) throw new Error('Batterijen category not found');
  return snap.docs[0].id;
}

/**
 * Helper: create a test product via Admin SDK (for tests that need a pre-existing product).
 * Returns the product ID.
 */
async function createTestProductAdmin(overrides = {}) {
  const db = getAdminFirestore();
  const batterijenId = await getBatterijenCategoryId();
  const doc = {
    categoryId: batterijenId,
    brand: 'Marstek',
    model: `E2E_Product_${Date.now()}`,
    description: 'E2E test product',
    purchasePrice: 1000,
    marginType: 'percent',
    marginValue: 30,
    discountType: 'percent',
    discountValue: 10,
    discountFromUnit: 2,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'e2e-test',
    ...overrides,
  };
  const ref = await db.collection('products').add(doc);
  return { id: ref.id, ...doc };
}

/**
 * Helper: delete a test product via Admin SDK.
 */
async function deleteTestProductAdmin(id) {
  const db = getAdminFirestore();
  try {
    await db.collection('products').doc(id).delete();
  } catch {}
}

test.describe('Product CRUD', () => {
  // Track products created during tests for cleanup
  const createdProductIds = [];

  test.afterAll(async () => {
    const db = getAdminFirestore();
    // Clean up all E2E test products
    const snap = await db.collection('products').get();
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if ((data.model && data.model.startsWith('E2E_')) ||
          (data.brand && data.brand.startsWith('E2E_'))) {
        batch.delete(d.ref);
        count++;
      }
    });
    if (count > 0) await batch.commit();

    // Also clean any tracked IDs (in case model was changed)
    for (const id of createdProductIds) {
      try { await db.collection('products').doc(id).delete(); } catch {}
    }
  });

  test('create product: fill form, verify preview, save', async ({ page }) => {
    await navigateAndWaitReady(page);
    const batterijenId = await getBatterijenCategoryId();

    // Click "Nieuw product"
    await page.click('#btnNewProduct');
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Fill form
    await page.selectOption('.detail-category', batterijenId);
    await page.selectOption('.detail-brand-select', 'Marstek');
    await page.fill('.detail-model', 'E2E_CreateTest');
    await page.fill('.detail-description', 'Test product for E2E');
    await page.fill('.detail-purchase-price', '1000');

    // Wait for price preview to update
    await page.waitForTimeout(300);

    // Verify live sell price preview: 1000 * 1.30 = 1300.00
    const previewSp = await page.locator('.detail-preview-sp').textContent();
    expect(previewSp).toContain('1300.00');

    // Verify 2nd unit preview: 1300 * 0.90 = 1170.00
    const previewU2 = await page.locator('.detail-preview-u2').textContent();
    expect(previewU2).toContain('1170.00');

    // Save
    await page.click('.detail-btn-save');

    // Wait for success toast (not the error toast)
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('aangemaakt'));
      },
      { timeout: 10_000 },
    );

    // Verify product appears in the list
    await page.waitForSelector('.product-card', { timeout: 5000 });
    const listText = await page.locator('#productList').textContent();
    expect(listText).toContain('E2E_CreateTest');
    expect(listText).toContain('Marstek');
  });

  test('edit product: change price, verify preview updates', async ({ page }) => {
    // Create a test product via Admin SDK
    const product = await createTestProductAdmin({ model: 'E2E_EditTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    // Find and click the E2E test product
    const card = page.locator('.product-card', { hasText: 'E2E_EditTest' });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    // Wait for detail form
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Change purchase price to 1200
    const priceInput = page.locator('.detail-purchase-price');
    await priceInput.fill('1200');

    // Wait for preview to update
    await page.waitForTimeout(300);

    // Verify new sell price: 1200 * 1.30 = 1560.00
    const previewSp = await page.locator('.detail-preview-sp').textContent();
    expect(previewSp).toContain('1560.00');

    // Save
    await page.click('.detail-btn-save');

    // Wait for success toast
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('bijgewerkt'));
      },
      { timeout: 10_000 },
    );

    // Verify the detail panel still shows updated price (it re-opens after save)
    await page.waitForTimeout(500);
    const detailPreview = await page.locator('.detail-preview-sp').textContent();
    expect(detailPreview).toContain('1560.00');
  });

  test('brand dropdown "Andere": custom brand input', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_BrandTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    // Click the test product
    const card = page.locator('.product-card', { hasText: 'E2E_BrandTest' });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Select "Andere…" from brand dropdown
    await page.selectOption('.detail-brand-select', '__other__');

    // Verify custom brand input appears
    const customBrandGroup = page.locator('[data-custom-brand-group]');
    await expect(customBrandGroup).not.toHaveClass(/d-none/);

    // Fill in custom brand
    await page.fill('.detail-custom-brand', 'E2E_CustomBrand');

    // Save
    await page.click('.detail-btn-save');
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('bijgewerkt'));
      },
      { timeout: 10_000 },
    );

    // Reload and verify custom brand persisted
    await page.reload();
    await navigateAndWaitReady(page);

    // Click the product card (now shows custom brand)
    const updatedCard = page.locator('.product-card', { hasText: 'E2E_CustomBrand' });
    await updatedCard.waitFor({ state: 'visible', timeout: 10_000 });
    await updatedCard.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Verify brand select shows "Andere" selected
    const brandVal = await page.locator('.detail-brand-select').inputValue();
    expect(brandVal).toBe('__other__');

    // Verify custom brand input has our value
    const customBrand = await page.locator('.detail-custom-brand').inputValue();
    expect(customBrand).toBe('E2E_CustomBrand');
  });

  test('korting toggle: fixed discount, preview updates', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_KortingTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    const card = page.locator('.product-card', { hasText: 'E2E_KortingTest' });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Switch discount type to fixed (€)
    await page.click('.detail-discount-type button[data-val="fixed"]');

    // Set fixed discount value to 200
    await page.fill('.detail-discount-value', '200');

    // Wait for preview
    await page.waitForTimeout(300);

    // Sell price = 1000 * 1.30 = 1300
    // 2nd unit with fixed €200 discount = 1300 - 200 = 1100
    const previewU2 = await page.locator('.detail-preview-u2').textContent();
    expect(previewU2).toContain('1100.00');
  });

  test('category filter: only matching products shown', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_FilterTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    // Wait for product list + category tabs
    const prodCard = page.locator('.product-card', { hasText: 'E2E_FilterTest' });
    await prodCard.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForSelector('#categoryTabs button', { timeout: 5000 });

    // Click "Batterijen" tab — our product (in Batterijen) should be visible
    const tabs = page.locator('#categoryTabs button');
    const batterijenTab = tabs.filter({ hasText: 'Batterijen' });
    await batterijenTab.click();
    await page.waitForTimeout(300);

    let listText = await page.locator('#productList').textContent();
    expect(listText).toContain('E2E_FilterTest');

    // Click "Omvormers" tab — our product should NOT be visible
    const omvormersTab = tabs.filter({ hasText: 'Omvormers' });
    await omvormersTab.click();
    await page.waitForTimeout(300);

    listText = await page.locator('#productList').textContent();
    expect(listText).not.toContain('E2E_FilterTest');

    // Click "Alle" tab — product should be back
    const alleTab = tabs.filter({ hasText: 'Alle' });
    await alleTab.click();
    await page.waitForTimeout(300);

    listText = await page.locator('#productList').textContent();
    expect(listText).toContain('E2E_FilterTest');
  });

  test('search: list filters by brand/model', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_SearchTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);
    const prodCard = page.locator('.product-card', { hasText: 'E2E_SearchTest' });
    await prodCard.waitFor({ state: 'visible', timeout: 10_000 });

    // Search by model
    await page.fill('#productSearch', 'E2E_SearchTest');
    await page.waitForTimeout(300);

    const cards = page.locator('.product-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    let listText = await page.locator('#productList').textContent();
    expect(listText).toContain('E2E_SearchTest');

    // Search for something that doesn't exist
    await page.fill('#productSearch', 'ZZZZNONEXISTENT');
    await page.waitForTimeout(300);

    const noCards = await page.locator('.product-card').count();
    expect(noCards).toBe(0);

    const emptyText = await page.locator('#productList').textContent();
    expect(emptyText).toContain('Geen producten gevonden');
  });

  test('deactivate and reactivate product', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_DeactivateTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    const card = page.locator('.product-card', { hasText: 'E2E_DeactivateTest' });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Click deactivate
    await page.click('.detail-btn-toggle-active');
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('gedeactiveerd'));
      },
      { timeout: 10_000 },
    );

    // Product should disappear from list (inactive toggle is off by default)
    await page.waitForTimeout(500);
    let listText = await page.locator('#productList').textContent();
    expect(listText).not.toContain('E2E_DeactivateTest');

    // Toggle "Toon inactieve" on
    await page.check('#toggleShowInactive');
    await page.waitForTimeout(300);

    // Product should appear again, with "Inactief" badge
    const inactiveCard = page.locator('.product-card', { hasText: 'E2E_DeactivateTest' });
    await expect(inactiveCard).toBeVisible();
    const inactiveText = await inactiveCard.textContent();
    expect(inactiveText).toContain('Inactief');

    // Click it and reactivate
    await inactiveCard.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    await page.click('.detail-btn-toggle-active');
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('geheractiveerd'));
      },
      { timeout: 10_000 },
    );

    // Uncheck "Toon inactieve"
    await page.uncheck('#toggleShowInactive');
    await page.waitForTimeout(300);

    // Product should be visible again (active)
    listText = await page.locator('#productList').textContent();
    expect(listText).toContain('E2E_DeactivateTest');

    // Verify no "Inactief" badge
    const activeCard = page.locator('.product-card', { hasText: 'E2E_DeactivateTest' });
    const activeCardText = await activeCard.textContent();
    expect(activeCardText).not.toContain('Inactief');
  });

  test('delete product: confirm dialog removes from list', async ({ page }) => {
    const product = await createTestProductAdmin({ model: 'E2E_DeleteTest' });
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    const card = page.locator('.product-card', { hasText: 'E2E_DeleteTest' });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Handle the confirm dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('E2E_DeleteTest');
      await dialog.accept();
    });

    // Click delete
    await page.click('.detail-btn-delete');

    // Wait for success toast
    await page.waitForFunction(
      () => {
        const toasts = document.querySelectorAll('.toast');
        return Array.from(toasts).some(t => t.textContent.includes('verwijderd'));
      },
      { timeout: 10_000 },
    );

    // Product should be gone from list
    await page.waitForTimeout(500);
    const listText = await page.locator('#productList').textContent();
    expect(listText).not.toContain('E2E_DeleteTest');
  });
});
