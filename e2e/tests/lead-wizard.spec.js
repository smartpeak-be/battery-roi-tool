// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'http://localhost:8000';
const CSV_FIXTURE = path.resolve('e2e/fixtures/test-fluvius.csv');

test.describe('Lead wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/lead.html`);
  });

  test('step 1: shows CSV upload instructions', async ({ page }) => {
    await expect(page.locator('#step1')).toBeVisible();
    await expect(page.locator('#step1')).toContainText('mijn.fluvius.be');
    await expect(page.locator('#btnStep1Next')).toBeDisabled();
  });

  test('step 1: rejects invalid file', async ({ page }) => {
    // Create a temporary non-CSV content
    const fileInput = page.locator('#csvFileInput');
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('invalid,headers\n1,2')
    });
    await expect(page.locator('#csvFeedback')).toContainText('kolom');
    await expect(page.locator('#btnStep1Next')).toBeDisabled();
  });

  test('step 1: accepts valid CSV and shows day count', async ({ page }) => {
    const fileInput = page.locator('#csvFileInput');
    await fileInput.setInputFiles(CSV_FIXTURE);
    await expect(page.locator('#csvFeedback')).toContainText('dagen');
    await expect(page.locator('#btnStep1Next')).toBeEnabled();
  });

  test('step 2: validates required fields', async ({ page }) => {
    // Upload CSV first
    await page.locator('#csvFileInput').setInputFiles(CSV_FIXTURE);
    await page.locator('#btnStep1Next').click();
    await expect(page.locator('#step2')).toBeVisible();

    // Try to proceed without filling fields
    await page.locator('#btnStep2Next').click();
    await expect(page.locator('#leadName')).toHaveClass(/is-invalid/);
    await expect(page.locator('#leadEmail')).toHaveClass(/is-invalid/);

    // Fill and proceed
    await page.fill('#leadName', 'Test Klant');
    await page.fill('#leadEmail', 'test@example.com');
    await page.locator('#btnStep2Next').click();
    await expect(page.locator('#step3')).toBeVisible();
  });

  test('step navigation: back buttons work', async ({ page }) => {
    await page.locator('#csvFileInput').setInputFiles(CSV_FIXTURE);
    await page.locator('#btnStep1Next').click();
    await expect(page.locator('#step2')).toBeVisible();

    // Go back to step 1
    await page.locator('.btnBack[data-back="1"]').click();
    await expect(page.locator('#step1')).toBeVisible();
  });
});
