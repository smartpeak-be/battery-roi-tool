// e2e/tests/product-settings.spec.js
// E2E tests for product settings and categories on producten-beheer.html
import { test, expect } from '../helpers/auth-fixture.js';
import { firebaseSignIn } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';

test.describe('Product settings and categories', () => {
  test.afterAll(async () => {
    const db = getAdminFirestore();

    // Clean up settings doc
    try {
      await db.doc('config/settings').delete();
    } catch {}

    // Clean up E2E test categories
    const cats = await db.collection('productCategories').get();
    const batch = db.batch();
    cats.docs.forEach(d => {
      if (d.data().name && d.data().name.startsWith('E2E_')) {
        batch.delete(d.ref);
      }
    });
    await batch.commit();
  });

  test('settings: save and reload persists values', async ({ page }) => {
    // Navigate to product management page
    await page.goto('/producten-beheer.html');

    // Authenticate (Firebase SDK loads on this page)
    await firebaseSignIn(page);

    // Wait for auth-gated UI to appear
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Open settings card (it starts collapsed)
    const settingsToggle = page.locator('#settingsToggle');
    const settingsBody = page.locator('#settingsBody');
    const isHidden = await settingsBody.evaluate(el => el.style.display === 'none');
    if (isHidden) {
      await settingsToggle.click();
      await settingsBody.waitFor({ state: 'visible', timeout: 5000 });
    }

    // Clear and fill all fields
    await page.fill('#settingsMarginValue', '25');
    await page.fill('#settingsDiscountValue', '15');
    await page.fill('#settingsDiscountFromUnit', '3');
    await page.fill('#settingsInstallCost', '300');
    await page.fill('#settingsInspectCost', '275');
    await page.fill('#settingsBebatPerKg', '0.55');

    // Click save
    await page.click('#btnSaveSettings');

    // Wait for toast to appear
    await page.waitForSelector('.toast', { state: 'visible', timeout: 5000 });

    // Reload page
    await page.reload();

    // Wait for auth-gated UI again
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Wait for settings to load from Firestore
    await page.waitForTimeout(1500);

    // Open settings card again
    const settingsBodyReload = page.locator('#settingsBody');
    const isHiddenReload = await settingsBodyReload.evaluate(el => el.style.display === 'none');
    if (isHiddenReload) {
      await page.click('#settingsToggle');
      await settingsBodyReload.waitFor({ state: 'visible', timeout: 5000 });
    }

    // Verify all values persisted
    await expect(page.locator('#settingsMarginValue')).toHaveValue('25');
    await expect(page.locator('#settingsDiscountValue')).toHaveValue('15');
    await expect(page.locator('#settingsDiscountFromUnit')).toHaveValue('3');
    await expect(page.locator('#settingsInstallCost')).toHaveValue('300');
    await expect(page.locator('#settingsInspectCost')).toHaveValue('275');
    await expect(page.locator('#settingsBebatPerKg')).toHaveValue('0.55');
  });

  test('settings: toggle marge from % to fixed', async ({ page }) => {
    // Navigate
    await page.goto('/producten-beheer.html');
    await firebaseSignIn(page);
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Open settings card
    const settingsBody = page.locator('#settingsBody');
    const isHidden = await settingsBody.evaluate(el => el.style.display === 'none');
    if (isHidden) {
      await page.click('#settingsToggle');
      await settingsBody.waitFor({ state: 'visible', timeout: 5000 });
    }

    // Click the "€" button to switch to fixed margin
    await page.click('#marginTypeToggle button[data-val="fixed"]');

    // Wait a moment for UI update
    await page.waitForTimeout(300);

    // Verify toggle state is "fixed"
    const dataType = await page.locator('#marginTypeToggle').getAttribute('data-type');
    expect(dataType).toBe('fixed');

    // Save
    await page.click('#btnSaveSettings');
    await page.waitForSelector('.toast', { state: 'visible', timeout: 5000 });

    // Reload page
    await page.reload();
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Wait for settings to load
    await page.waitForTimeout(1500);

    // Open settings card
    const settingsBodyReload = page.locator('#settingsBody');
    const isHiddenReload = await settingsBodyReload.evaluate(el => el.style.display === 'none');
    if (isHiddenReload) {
      await page.click('#settingsToggle');
      await settingsBodyReload.waitFor({ state: 'visible', timeout: 5000 });
    }

    // Verify toggle persisted
    const dataTypeAfterReload = await page.locator('#marginTypeToggle').getAttribute('data-type');
    expect(dataTypeAfterReload).toBe('fixed');
  });

  test('categories: default categories are seeded', async ({ page }) => {
    // Navigate
    await page.goto('/producten-beheer.html');
    await firebaseSignIn(page);
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Wait for category tabs to render
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10_000 });

    // Wait a moment for categories to load
    await page.waitForTimeout(1000);

    // Get tab button texts
    const tabs = page.locator('#categoryTabs button');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4); // At least "Alle" + 3 defaults

    // Verify default category names are present
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts).toContain('Alle');
    expect(tabTexts).toContain('Batterijen');
    expect(tabTexts).toContain('Omvormers');
    expect(tabTexts).toContain('Materiaal');
  });

  test('categories: create new category appears as tab', async ({ page }) => {
    // Navigate
    await page.goto('/producten-beheer.html');
    await firebaseSignIn(page);
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Wait for category tabs to load
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(1000);

    // Click "Manage Categories" button
    await page.click('#btnManageCategories');

    // Wait for modal to appear
    await page.waitForSelector('#categoryModal', { state: 'visible', timeout: 5000 });

    // Click "Add Category"
    await page.click('#btnAddCategory');

    // Wait for new row to render
    await page.waitForTimeout(300);

    // Fill in the last category name input
    const nameInputs = page.locator('#categoryList .cat-name-input');
    const lastInput = nameInputs.last();
    await lastInput.fill('E2E_TestCategory');

    // Click "Save Categories"
    await page.click('#btnSaveCategories');

    // Wait for modal to hide
    await page.waitForSelector('#categoryModal', { state: 'hidden', timeout: 5000 });

    // Wait for tabs to re-render
    await page.waitForTimeout(1000);

    // Verify new category appears in tabs
    const tabs = page.locator('#categoryTabs button');
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts).toContain('E2E_TestCategory');
  });

  test('categories: cannot delete default category', async ({ page }) => {
    // Navigate
    await page.goto('/producten-beheer.html');
    await firebaseSignIn(page);
    await page.waitForSelector('#stateAuthorized', {
      state: 'visible',
      timeout: 15_000,
    });

    // Wait for category tabs
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(1000);

    // Open category modal
    await page.click('#btnManageCategories');
    await page.waitForSelector('#categoryModal', { state: 'visible', timeout: 5000 });

    // Wait for category list to render
    await page.waitForTimeout(500);

    // Find the default row
    const defaultRow = page.locator('#categoryList .cat-row.is-default');
    await expect(defaultRow).toBeVisible();

    // Find its delete button
    const deleteBtn = defaultRow.locator('.btn-delete-cat');

    // Verify delete button is disabled
    await expect(deleteBtn).toBeDisabled();
  });
});
