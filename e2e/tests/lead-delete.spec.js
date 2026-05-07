// @ts-check
import { test, expect } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

test.describe('Lead soft + hard delete', () => {
  let leadId;
  const testLeadName = `E2E_LeadDel_${Date.now()}`;

  test.beforeAll(async () => {
    const db = getAdminFirestore();
    const ref = await db.collection('leads').add({
      customerName: testLeadName,
      email:        'e2e-delete@example.com',
      status:       'cold_lead',
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      deletedAt:    null,
      notes:        'E2E delete-flow lead',
    });
    leadId = ref.id;
  });

  test.afterAll(async () => {
    const db = getAdminFirestore();
    try { await db.collection('leads').doc(leadId).delete(); } catch { /* may already be hard-deleted */ }
  });

  test('soft-delete hides lead, toggle reveals it, restore puts it back, hard-delete removes it', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/dashboard.html');
    await page.waitForSelector('#leadsCard', { state: 'visible', timeout: 15_000 });

    const visibleRow = () => page.locator('#leadsList tr', { hasText: testLeadName });

    // 1. Lead is visible by default (active)
    await expect(visibleRow()).toBeVisible({ timeout: 10_000 });

    // 2. Soft-delete via the trash button on this row
    await visibleRow().locator('.deleteLeadBtn').click();
    await expect(visibleRow()).toBeHidden({ timeout: 10_000 });

    // Verify Firestore now has deletedAt set
    let snap = await getAdminFirestore().collection('leads').doc(leadId).get();
    expect(snap.data().deletedAt).not.toBeNull();

    // 3. Toggle "Toon verwijderde" — the row reappears, greyed out
    await page.locator('#toggleShowDeletedLeads').check();
    await expect(visibleRow()).toBeVisible({ timeout: 10_000 });
    await expect(visibleRow()).toHaveClass(/opacity-50/);

    // 4. Restore — row goes back to active styling (no opacity-50)
    await visibleRow().locator('.restoreLeadBtn').click();
    await expect(visibleRow()).not.toHaveClass(/opacity-50/, { timeout: 10_000 });

    snap = await getAdminFirestore().collection('leads').doc(leadId).get();
    expect(snap.data().deletedAt).toBeNull();

    // 5. Soft-delete again so we can hard-delete
    await visibleRow().locator('.deleteLeadBtn').click();
    await expect(visibleRow()).toHaveClass(/opacity-50/, { timeout: 10_000 });

    // 6. Hard-delete — doc is removed from Firestore entirely
    await visibleRow().locator('.permdelLeadBtn').click();
    await expect(visibleRow()).toBeHidden({ timeout: 10_000 });

    snap = await getAdminFirestore().collection('leads').doc(leadId).get();
    expect(snap.exists).toBe(false);
  });
});
