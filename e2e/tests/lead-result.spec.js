// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000';

test.describe('Lead result page', () => {
  test('shows error for missing lead ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/lead-result.html`);
    await expect(page.locator('#resultContainer')).toContainText('Ongeldige link');
  });

  test('shows error for nonexistent lead ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/lead-result.html?r=nonexistent_id_12345`);
    // Wait for Firebase to respond
    await page.waitForTimeout(3000);
    await expect(page.locator('#resultContainer')).toContainText('niet gevonden');
  });
});
