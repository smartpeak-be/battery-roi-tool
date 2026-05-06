// @ts-check
import { test, expect } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

test.describe('Lead to project conversion', () => {
  let leadId;
  const testLeadName = `E2E_Lead_${Date.now()}`;

  test.beforeAll(async () => {
    // Create a test lead via Admin SDK
    const db = getAdminFirestore();
    const ref = await db.collection('leads').add({
      customerName: testLeadName,
      email: 'e2e-test@example.com',
      status: 'cold_lead',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      pvInverterKw: 3.5,
      pricePerKwh: 0.34,
      effectiveBtw: 21,
      notes: 'E2E test lead'
    });
    leadId = ref.id;
    console.log(`[setup] Created test lead: ${leadId}`);
  });

  test.afterAll(async () => {
    const db = getAdminFirestore();
    // Clean up the test lead
    try {
      await db.collection('leads').doc(leadId).delete();
      console.log(`[cleanup] Deleted test lead: ${leadId}`);
    } catch { /* ignore */ }

    // Clean up any project created from this lead
    const projects = await db.collection('projects')
      .where('customerName', '==', testLeadName)
      .get();
    for (const doc of projects.docs) {
      await doc.ref.delete();
      console.log(`[cleanup] Deleted project: ${doc.id}`);
    }
  });

  test('convert lead to project navigates to project-edit', async ({ page }) => {
    // Capture all console output
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate to dashboard (already authenticated via fixture)
    await page.goto('/dashboard.html');

    // Wait for leads to load
    await page.waitForSelector('#leadsCard', { state: 'visible', timeout: 15_000 });

    // Find our test lead in the leads table
    const leadRow = page.locator('#leadsList tr', { hasText: testLeadName });
    await expect(leadRow).toBeVisible({ timeout: 10_000 });

    // Accept the confirm dialog when it appears
    page.on('dialog', dialog => dialog.accept());

    // Click the convert button
    await leadRow.locator('.convertLeadBtn').click();

    // Should navigate to project-edit page
    await page.waitForURL(/project-edit\.html\?project=/, { timeout: 20_000 });

    // Extract the project ID
    const url = new URL(page.url());
    const projectId = url.searchParams.get('project');
    expect(projectId).toBeTruthy();
    console.log(`[test] Created project: ${projectId}`);

    // Log any warnings (helps debug rules issues)
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    warnings.forEach(w => console.log(`[browser-warn] ${w.text}`));

    // Verify the project was created with the lead's data
    const db = getAdminFirestore();
    const projectDoc = await db.collection('projects').doc(projectId).get();
    expect(projectDoc.exists).toBe(true);
    expect(projectDoc.data().customerName).toBe(testLeadName);
    expect(projectDoc.data().email).toBe('e2e-test@example.com');

    // Verify lead was marked as converted
    const leadDoc = await db.collection('leads').doc(leadId).get();
    expect(leadDoc.data().status).toBe('converted');
    expect(leadDoc.data().projectId).toBe(projectId);
    console.log(`[test] Lead status correctly set to 'converted'`);
  });
});
