// e2e/tests/serial-ocr.spec.js
//
// Happy-path E2E for serial-OCR (Task 11 of 2026-05-19-serial-ocr plan):
//   1. Open project-edit Blok D
//   2. Upload a fixture image via the photo-uploader gallery input
//   3. Tag it as Serieel + Batterij and save
//   4. Wait for the photo-doc to carry ocrStatus='pending'
//   5. SIMULATE the Cloud Function (not deployed in test env) by writing the
//      post-OCR state to Firestore directly via the Admin SDK:
//        - patch the photo doc with ocrStatus='ok' + serialEntryId
//        - append a new entry to project.serialNumbers
//   6. Verify the new serial-row appears in #peSerialList through the live
//      onSnapshot listener on the project doc.
//
// The Cloud Function itself is covered by separate unit tests; here we
// validate that the UI reacts correctly to the post-OCR Firestore state.

import { test, expect } from '../helpers/auth-fixture.js';
import {
  createTestProject,
  cleanupProject,
  getAdminFirestore,
} from '../helpers/project-helpers.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTO_PATH = resolve(__dirname, '../fixtures/serial-photo.jpg');
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

test.describe.serial('Serial-OCR happy-path', () => {
  let projectId;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await createTestProject(page, {
      customerName: `E2E_OCR_${Date.now()}`,
    });
    projectId = result.projectId;
    await page.close();
    await context.close();
  });

  test.afterAll(async () => {
    if (projectId) await cleanupProject(projectId);
  });

  test('upload + tag as serial + simulate OCR -> row appears in Blok D', async ({ page }) => {
    // Step 1: open project-edit, wait for Blok D photo-uploader to mount.
    await page.goto(`/project-edit.html?project=${projectId}`);
    await page.waitForSelector('#peBlokDPhotoUploader [data-pu-root]', {
      state: 'attached',
      timeout: 15_000,
    });

    // Step 2: upload via the gallery file input (the camera input has
    // capture="environment" which Playwright still accepts, but the gallery
    // input is the more conventional path and the one dashboard-ui.spec.js
    // already validates).
    const fileInput = page.locator('#peBlokDPhotoUploader input[data-pu-gallery]').first();
    await fileInput.setInputFiles(PHOTO_PATH);

    // Step 3: tag-modal opens after the upload completes. The modal id is
    // '#pu-tag-modal' (singleton appended to <body> by the photo-uploader).
    // Bootstrap toggles the '.show' class when visible.
    const tagModal = page.locator('#pu-tag-modal');
    await expect(tagModal).toHaveClass(/show/, { timeout: 20_000 });

    // The radio names are scoped per photo as `tag-<id>` / `cat-<id>`.
    // We don't know the id up-front, but there's only one row in the modal
    // (we uploaded a single file), so the `.first()` locators are safe.
    // Switch the tag to Serieel — clicking the label toggles the .btn-check.
    const serialLabel = tagModal.locator('label.btn:has-text("Serieel")').first();
    await serialLabel.click();

    // Category 'Batterij' is default-checked when Serieel is selected, but
    // click the label to be explicit (no-op if already checked).
    const batterijLabel = tagModal.locator('label.btn:has-text("Batterij")').first();
    await batterijLabel.click();

    // Save.
    await tagModal.locator('[data-pu-modal-save]').click();

    // Wait for modal to close (save commits Firestore writes, then hides).
    await expect(tagModal).not.toHaveClass(/show/, { timeout: 15_000 });

    // Step 4: wait for the photo-doc to have tag='serial' + ocrStatus='pending'.
    // The save handler writes both atomically in a Firestore batch.
    const db = getAdminFirestore();
    let photoId = null;
    await expect.poll(async () => {
      const snap = await db.collection('projects').doc(projectId).collection('photos').get();
      const doc = snap.docs.find(d => d.data().tag === 'serial');
      if (!doc) return null;
      photoId = doc.id;
      return doc.data().ocrStatus;
    }, { timeout: 15_000 }).toBe('pending');

    expect(photoId).toBeTruthy();

    // Step 5: SIMULATE the Cloud Function — write the post-OCR result.
    // (The real function does Vision API call -> serial-extract -> txn update;
    //  we bypass it entirely since the function isn't deployed in test env.)
    const photoRef   = db.collection('projects').doc(projectId).collection('photos').doc(photoId);
    const projectRef = db.collection('projects').doc(projectId);
    const newEntry = {
      id:          'sn_test1',
      value:       'OCRTEST12345',
      category:    'batterij',
      source:      'ocr',
      photoId,
      ocrStatus:   'ok',
      uploadedAt:  admin.firestore.Timestamp.now(),
      uploadedBy:  'ocr-test',
    };
    await db.runTransaction(async (txn) => {
      const ps = await txn.get(projectRef);
      const list = (ps.data() && ps.data().serialNumbers) || [];
      txn.update(projectRef, { serialNumbers: [...list, newEntry] });
      txn.update(photoRef, {
        ocrStatus:      'ok',
        serialEntryId:  'sn_test1',
        ocrCandidates:  ['OCRTEST12345'],
      });
    });

    // Step 6: verify the new row appears in #peSerialList — the onSnapshot
    // listener on the project doc (project-edit.html line 226) calls
    // rerenderBlokD() whenever serialNumbers changes.
    const newRow = page.locator(`#peSerialList .serial-row[data-serial-id="sn_test1"]`);
    await expect(newRow).toBeVisible({ timeout: 15_000 });
    await expect(newRow.locator('input.serial-value')).toHaveValue('OCRTEST12345', { timeout: 5_000 });
    await expect(newRow.locator('.serial-cat-batterij')).toBeVisible();
  });

  test('failed OCR shows re-run knop → click resets to pending', async ({ page }) => {
    // Pre-seed a serial-tagged photo + failed entry directly via Admin.
    const db = getAdminFirestore();
    const photoRef = db.collection('projects').doc(projectId).collection('photos').doc('photo_failed');
    await photoRef.set({
      tag: 'serial',
      serialCategory: 'omvormer',
      ocrStatus: 'failed',
      storagePath: `projects/${projectId}/test_fake.jpg`,
      serialEntryId: 'sn_fail1',
      ocrError: 'no-text-detected',
      ocrCandidates: [],
      uploadedBy: 'test',
      uploadedAt: admin.firestore.Timestamp.now(),
    });
    await db.collection('projects').doc(projectId).update({
      serialNumbers: [{
        id: 'sn_fail1',
        value: '',
        category: 'omvormer',
        source: 'ocr',
        photoId: 'photo_failed',
        ocrStatus: 'failed',
        uploadedAt: admin.firestore.Timestamp.now(),
        uploadedBy: 'test',
      }],
    });

    // Open project-edit and find the failed row.
    await page.goto(`/project-edit.html?project=${projectId}`);
    const row = page.locator('#peSerialList .serial-row[data-serial-id="sn_fail1"]');
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The re-run knop must be visible (only on isOcr && isFailed rows).
    const rerunBtn = row.locator('.serial-rerun-btn');
    await expect(rerunBtn).toBeVisible();

    // Click it.
    await rerunBtn.click();

    // Poll the photo-doc: ocrStatus should now be null (re-run requested).
    await expect.poll(async () => {
      const snap = await photoRef.get();
      return snap.exists ? snap.data().ocrStatus : 'missing';
    }, { timeout: 5_000 }).toBe(null);
  });
});
