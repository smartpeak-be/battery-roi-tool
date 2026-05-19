// e2e/tests/meerkost-lines.spec.js
//
// Happy-path spec for the meerkost multi-line feature.
// This spec FAILS until the UI changes are implemented (Task 2+).
// The intended failure is: `.meerkost-details` selector not found (UI not yet built).
//
// Verifies:
//  1. Calc page opens for a project with required metadata
//  2. CSV is loaded, sheet configs are loaded, two distinct configs are selected
//  3. Per-config `.meerkost-details` disclosures can be opened
//  4. Line items (description + amount) can be added via `.meerkost-add-btn`
//  5. After Bereken, the first Worst Case card shows an `.installprice-details`
//     disclosure with a breakdown: line descriptions + "Basis configuratie" + "Totaal installatie"
//  6. The saved project doc has `lastCalcRun.inputs.meerkostLines` (not meerkostMap)

import { test, expect } from '../helpers/auth-fixture.js';
import {
  createTestProject,
  uploadCsvToProject,
  cleanupProject,
  getAdminFirestore,
} from '../helpers/project-helpers.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../fixtures/test-fluvius.csv');

let projectId;

test.describe('Meerkost multi-line happy path', () => {
  // The test does a lot: project create, CSV upload, admin patch, calc, assertion
  test.setTimeout(90_000);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await createTestProject(page, {
      customerName: `E2E_MEERKOST_${Date.now()}`,
    });
    projectId = result.projectId;

    await page.close();
    await context.close();

    // Patch required project metadata via admin so Bereken can run
    await getAdminFirestore().collection('projects').doc(projectId).set({
      site: { houseAgeOver10Years: true },                          // → 6% BTW
      supplier: { priceDay: 0.30, priceNight: 0.20, isSingleTariff: false },
      solar: { inverters: [{ id: 'inv1', powerKw: 5.0 }] },
    }, { merge: true });

    // Upload CSV via project-edit UI (uses the real helper which navigates + saves)
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await uploadCsvToProject(page2, projectId, CSV_PATH);
    await page2.close();
    await ctx2.close();
  });

  test.afterAll(async () => {
    if (projectId) await cleanupProject(projectId);
  });

  test('add multi-line meerkost per config, calculate, verify breakdown + Firestore', async ({ page }) => {
    // ── Step 1: open the calculator on the project ─────────────────────────
    await page.goto(`/index.html?project=${projectId}`);
    await page.waitForSelector('#projectBanner', { state: 'visible', timeout: 20_000 });

    // ── Step 2: load sheet configs ─────────────────────────────────────────
    await page.click('.btn-load-configs');
    await page.waitForSelector('.config-select', { state: 'visible', timeout: 20_000 });

    // ── Step 3: pick config 1 ──────────────────────────────────────────────
    const firstSelect = page.locator('.config-select').first();
    const allOptions = await firstSelect.locator('option:not([value=""])').all();
    expect(allOptions.length).toBeGreaterThan(1); // need ≥ 2 to pick 2 configs
    const firstValue = await allOptions[0].getAttribute('value');
    await firstSelect.selectOption(firstValue);
    await page.waitForTimeout(500); // N+1 row appears

    // ── Step 4: pick config 2 ──────────────────────────────────────────────
    const secondSelect = page.locator('.config-select').nth(1);
    const secondOptions = await secondSelect.locator('option:not([value=""]):not([disabled])').all();
    expect(secondOptions.length).toBeGreaterThan(0);
    const secondValue = await secondOptions[0].getAttribute('value');
    await secondSelect.selectOption(secondValue);
    await page.waitForTimeout(500);

    // ── Step 5: config 1 — open meerkost details, add 2 lines ─────────────
    // The first .config-picker-row should contain a .meerkost-details disclosure
    const row1 = page.locator('.config-picker-row').nth(0);
    const disclosure1 = row1.locator('.meerkost-details');

    // This waitForSelector is the INTENDED failing point until the UI is built:
    await disclosure1.waitFor({ state: 'visible', timeout: 10_000 });

    // Open the disclosure (click the <summary>)
    await disclosure1.locator('summary').click();

    // Add line 1: "Extra bekabeling" / 250
    await row1.locator('.meerkost-add-btn').click();
    const line1 = row1.locator('.meerkost-row').nth(0);
    await line1.locator('.meerkost-desc').fill('Extra bekabeling');
    await line1.locator('.meerkost-amount').fill('250');

    // Add line 2: "Werkuren keuring" / 100
    await row1.locator('.meerkost-add-btn').click();
    const line2 = row1.locator('.meerkost-row').nth(1);
    await line2.locator('.meerkost-desc').fill('Werkuren keuring');
    await line2.locator('.meerkost-amount').fill('100');

    // ── Step 6: config 2 — open meerkost details, add 1 line ──────────────
    const row2 = page.locator('.config-picker-row').nth(1);
    const disclosure2 = row2.locator('.meerkost-details');
    await disclosure2.waitFor({ state: 'visible', timeout: 10_000 });
    await disclosure2.locator('summary').click();

    await row2.locator('.meerkost-add-btn').click();
    const line3 = row2.locator('.meerkost-row').nth(0);
    await line3.locator('.meerkost-desc').fill('Stopcontact verplaatsen');
    await line3.locator('.meerkost-amount').fill('80');

    // ── Step 7: click Bereken ──────────────────────────────────────────────
    await page.click('.btn-calculate');
    await page.waitForSelector('#scenariosGrid .scenario-card', {
      state: 'visible',
      timeout: 30_000,
    });

    // ── Step 8: verify installprice breakdown on first Worst Case card ─────
    // Worst Case cards have class .worst-case; the first one corresponds to config 1
    const worstCaseCard = page.locator('#scenariosGrid .scenario-card.worst-case').first();

    const installDetails = worstCaseCard.locator('.installprice-details');
    await installDetails.waitFor({ state: 'visible', timeout: 10_000 });

    // Click the <summary> to expand the breakdown
    await installDetails.locator('summary').click();

    // Verify the breakdown contains expected entries
    await expect(installDetails).toContainText('Extra bekabeling');
    await expect(installDetails).toContainText('Werkuren keuring');
    await expect(installDetails).toContainText('Basis configuratie');
    await expect(installDetails).toContainText('Totaal installatie');

    // ── Step 9: assert Firestore has meerkostLines (not meerkostMap) ───────
    const snap = await getAdminFirestore()
      .collection('projects')
      .doc(projectId)
      .get();
    const data = snap.data();

    const inputs = data?.lastCalcRun?.inputs;
    expect(inputs).toBeDefined();

    // New schema: meerkostLines keyed by config type
    expect(inputs.meerkostLines).toBeDefined();
    expect(typeof inputs.meerkostLines).toBe('object');

    // Should have entries for both configs
    const lineKeys = Object.keys(inputs.meerkostLines);
    expect(lineKeys.length).toBe(2);

    // Old meerkostMap field should NOT be present (replaced by meerkostLines)
    expect(inputs.meerkostMap).toBeUndefined();
  });
});
