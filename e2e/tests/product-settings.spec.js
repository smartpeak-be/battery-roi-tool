// e2e/tests/product-settings.spec.js
// E2E tests for product settings and categories on producten-beheer.html
import { test, expect } from '../helpers/auth-fixture.js';
import { firebaseSignIn } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';

/**
 * Helper: navigate to producten-beheer.html, authenticate, and wait until
 * the page is fully initialized (settings loaded + categories rendered).
 */
async function navigateAndWaitReady(page) {
  await page.goto('/producten-beheer.html');
  await firebaseSignIn(page);

  // Wait for auth-gated UI
  await page.waitForSelector('#stateAuthorized', {
    state: 'visible',
    timeout: 15_000,
  });

  // Wait for the page to signal that all async init is done
  await page.waitForFunction(
    () => document.getElementById('stateAuthorized')?.dataset.ready === 'true',
    { timeout: 15_000 },
  );
}

/**
 * Helper: open settings card if collapsed.
 */
async function openSettingsCard(page) {
  const settingsBody = page.locator('#settingsBody');
  const isHidden = await settingsBody.evaluate(el => el.style.display === 'none');
  if (isHidden) {
    await page.click('#settingsToggle');
    await settingsBody.waitFor({ state: 'visible', timeout: 5000 });
  }
}

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
    await navigateAndWaitReady(page);
    await openSettingsCard(page);

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

    // Reload page and wait for full initialization
    await page.reload();
    await navigateAndWaitReady(page);
    await openSettingsCard(page);

    // Verify all values persisted
    await expect(page.locator('#settingsMarginValue')).toHaveValue('25');
    await expect(page.locator('#settingsDiscountValue')).toHaveValue('15');
    await expect(page.locator('#settingsDiscountFromUnit')).toHaveValue('3');
    await expect(page.locator('#settingsInstallCost')).toHaveValue('300');
    await expect(page.locator('#settingsInspectCost')).toHaveValue('275');
    await expect(page.locator('#settingsBebatPerKg')).toHaveValue('0.55');
  });

  test('settings: toggle marge from % to fixed', async ({ page }) => {
    await navigateAndWaitReady(page);
    await openSettingsCard(page);

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

    // Reload page and wait for full initialization
    await page.reload();
    await navigateAndWaitReady(page);
    await openSettingsCard(page);

    // Verify toggle persisted
    const dataTypeAfterReload = await page.locator('#marginTypeToggle').getAttribute('data-type');
    expect(dataTypeAfterReload).toBe('fixed');
  });

  test('categories: default categories are seeded', async ({ page }) => {
    await navigateAndWaitReady(page);

    // Wait for category tab buttons to appear (at least "Alle" + defaults)
    await page.waitForSelector('#categoryTabs button', { state: 'visible', timeout: 10_000 });

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
    await navigateAndWaitReady(page);

    // Wait for category tab buttons to appear
    await page.waitForSelector('#categoryTabs button', { state: 'visible', timeout: 10_000 });

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

    // Wait for tabs to re-render (data-ready resets and re-sets)
    await page.waitForSelector('#categoryTabs button', { state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(500);

    // Verify new category appears in tabs
    const tabs = page.locator('#categoryTabs button');
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts).toContain('E2E_TestCategory');
  });

  test('categories: cannot delete default category', async ({ page }) => {
    await navigateAndWaitReady(page);

    // Wait for category tab buttons to appear
    await page.waitForSelector('#categoryTabs button', { state: 'visible', timeout: 10_000 });

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
