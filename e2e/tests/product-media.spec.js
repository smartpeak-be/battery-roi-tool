// e2e/tests/product-media.spec.js
// E2E tests for product media (photos + datasheets) on producten-beheer.html
import { test, expect } from '../helpers/auth-fixture.js';
import { firebaseSignIn } from '../helpers/auth-fixture.js';
import { getAdminFirestore, getAdminStorage } from '../helpers/project-helpers.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Helper: navigate to producten-beheer.html, authenticate, and wait until ready.
 */
async function navigateAndWaitReady(page) {
  await page.goto('/producten-beheer.html');
  await firebaseSignIn(page);
  await page.waitForSelector('#stateAuthorized', { state: 'visible', timeout: 15_000 });
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
 * Helper: create a test product via Admin SDK.
 */
async function createTestProductAdmin(overrides = {}) {
  const db = getAdminFirestore();
  const batterijenId = await getBatterijenCategoryId();
  const doc = {
    categoryId: batterijenId,
    brand: 'Marstek',
    model: `E2E_Media_${Date.now()}`,
    description: 'E2E media test product',
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

/**
 * Helper: cleanup test product + all subcollections + storage blobs.
 */
async function cleanupTestProduct(productId) {
  const db = getAdminFirestore();
  const bucket = getAdminStorage();

  // Delete photos subcollection + storage
  const photosSnap = await db.collection('products').doc(productId).collection('photos').get();
  for (const doc of photosSnap.docs) {
    const data = doc.data();
    if (data.storagePath) {
      try { await bucket.file(data.storagePath).delete(); } catch (_) {}
    }
    if (data.thumbStoragePath) {
      try { await bucket.file(data.thumbStoragePath).delete(); } catch (_) {}
    }
    await doc.ref.delete();
  }

  // Delete datasheets subcollection + storage
  const dsSnap = await db.collection('products').doc(productId).collection('datasheets').get();
  for (const doc of dsSnap.docs) {
    const data = doc.data();
    if (data.storagePath) {
      try { await bucket.file(data.storagePath).delete(); } catch (_) {}
    }
    await doc.ref.delete();
  }

  // Delete product doc
  await db.collection('products').doc(productId).delete();
}

test.describe('Product Media', () => {
  const createdProductIds = [];

  test.afterAll(async () => {
    for (const id of createdProductIds) {
      try { await cleanupTestProduct(id); } catch (_) {}
    }
  });

  test('upload photo shows thumbnail in grid', async ({ page }) => {
    const product = await createTestProductAdmin();
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    // Wait for detail form
    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Scroll down to make sure photo section is visible
    await page.evaluate(() => {
      const grid = document.querySelector('.product-photo-grid');
      if (grid) grid.scrollIntoView({ behavior: 'instant' });
    });

    // Wait for photo grid to load (initially "Geen foto's")
    await page.waitForFunction(
      () => {
        const grid = document.querySelector('.product-photo-grid');
        return grid && !grid.textContent.includes('Laden');
      },
      { timeout: 10_000 },
    );

    // Upload a test photo via the file input
    const photoPath = join(__dirname, '..', 'fixtures', 'test-photo.jpg');
    const fileInput = page.locator('.photo-file-input');
    await fileInput.setInputFiles(photoPath);

    // Wait for upload to complete — thumbnail should appear
    const photoItem = page.locator('.product-photo-grid .photo-item');
    await expect(photoItem).toHaveCount(1, { timeout: 15_000 });

    // Verify thumbnail image is rendered
    const thumb = photoItem.locator('.photo-thumb');
    await expect(thumb).toBeVisible();
    const src = await thumb.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src.length).toBeGreaterThan(10);

    // Verify in Firestore
    const db = getAdminFirestore();
    const photosSnap = await db.collection('products').doc(product.id).collection('photos').get();
    expect(photosSnap.size).toBe(1);
    const photoDoc = photosSnap.docs[0].data();
    expect(photoDoc.storagePath).toContain(`products/${product.id}/`);
    expect(photoDoc.thumbStoragePath).toContain('_thumb.jpg');
  });

  test('delete photo removes from grid', async ({ page }) => {
    const product = await createTestProductAdmin();
    createdProductIds.push(product.id);

    // Pre-upload a photo via Admin SDK + Storage
    const db = getAdminFirestore();
    const bucket = getAdminStorage();
    const storagePath = `products/${product.id}/test_photo.jpg`;
    const thumbPath = `products/${product.id}/test_photo_thumb.jpg`;

    // Upload a tiny JPEG blob
    const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP/wgARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z', 'base64');
    await bucket.file(storagePath).save(tinyJpeg, { metadata: { contentType: 'image/jpeg' } });
    await bucket.file(thumbPath).save(tinyJpeg, { metadata: { contentType: 'image/jpeg' } });

    await db.collection('products').doc(product.id).collection('photos').add({
      storagePath,
      thumbStoragePath: thumbPath,
      name: 'test_photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: tinyJpeg.length,
      width: 1,
      height: 1,
      uploadedAt: new Date(),
      uploadedBy: 'e2e-test',
    });

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Wait for photo to appear
    const photoItem = page.locator('.product-photo-grid .photo-item');
    await expect(photoItem).toHaveCount(1, { timeout: 10_000 });

    // Handle the confirm dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click delete button on the photo
    await photoItem.hover();
    const deleteBtn = photoItem.locator('.photo-delete-btn');
    await deleteBtn.click();

    // Verify photo is removed from grid
    await expect(page.locator('.product-photo-grid .photo-item')).toHaveCount(0, { timeout: 5000 });

    // Verify removed from Firestore
    const photosSnap = await db.collection('products').doc(product.id).collection('photos').get();
    expect(photosSnap.size).toBe(0);
  });

  test('upload datasheet shows in list', async ({ page }) => {
    const product = await createTestProductAdmin();
    createdProductIds.push(product.id);

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Wait for datasheet list to load
    await page.waitForFunction(
      () => {
        const list = document.querySelector('.datasheet-list');
        return list && !list.textContent.includes('Laden');
      },
      { timeout: 10_000 },
    );

    // Upload a test datasheet via the file input
    const dsPath = join(__dirname, '..', 'fixtures', 'test-datasheet.pdf');
    const fileInput = page.locator('.datasheet-file-input');
    await fileInput.setInputFiles(dsPath);

    // Wait for upload to complete — row should appear
    const dsRow = page.locator('.datasheet-list .ds-row');
    await expect(dsRow).toHaveCount(1, { timeout: 15_000 });

    // Verify filename is shown
    const dsName = dsRow.locator('.ds-name');
    await expect(dsName).toContainText('test-datasheet.pdf');

    // Verify download link
    const href = await dsName.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('#');

    // Verify in Firestore
    const db = getAdminFirestore();
    const dsSnap = await db.collection('products').doc(product.id).collection('datasheets').get();
    expect(dsSnap.size).toBe(1);
    const dsDoc = dsSnap.docs[0].data();
    expect(dsDoc.storagePath).toContain('datasheets/');
    expect(dsDoc.name).toBe('test-datasheet.pdf');
  });

  test('delete datasheet removes from list', async ({ page }) => {
    const product = await createTestProductAdmin();
    createdProductIds.push(product.id);

    // Pre-upload a datasheet via Admin SDK
    const db = getAdminFirestore();
    const bucket = getAdminStorage();
    const storagePath = `products/${product.id}/datasheets/test_ds.pdf`;

    const tinyPdf = Buffer.from('%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');
    await bucket.file(storagePath).save(tinyPdf, { metadata: { contentType: 'application/pdf' } });

    await db.collection('products').doc(product.id).collection('datasheets').add({
      storagePath,
      name: 'test_ds.pdf',
      contentType: 'application/pdf',
      sizeBytes: tinyPdf.length,
      uploadedAt: new Date(),
      uploadedBy: 'e2e-test',
    });

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Wait for datasheet to appear
    const dsRow = page.locator('.datasheet-list .ds-row');
    await expect(dsRow).toHaveCount(1, { timeout: 10_000 });
    await expect(dsRow.locator('.ds-name')).toContainText('test_ds.pdf');

    // Handle confirm dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click delete
    const deleteBtn = dsRow.locator('.ds-delete-btn');
    await deleteBtn.click();

    // Verify removed from list
    await expect(page.locator('.datasheet-list .ds-row')).toHaveCount(0, { timeout: 5000 });

    // Verify removed from Firestore
    const dsSnap = await db.collection('products').doc(product.id).collection('datasheets').get();
    expect(dsSnap.size).toBe(0);
  });

  test('delete product cascades photos and datasheets', async ({ page }) => {
    const product = await createTestProductAdmin();
    createdProductIds.push(product.id);

    // Pre-upload a photo + datasheet via Admin SDK
    const db = getAdminFirestore();
    const bucket = getAdminStorage();

    const photoPath = `products/${product.id}/cascade_photo.jpg`;
    const thumbPath = `products/${product.id}/cascade_photo_thumb.jpg`;
    const dsPath = `products/${product.id}/datasheets/cascade_ds.pdf`;

    const tinyBlob = Buffer.alloc(10);
    await Promise.all([
      bucket.file(photoPath).save(tinyBlob, { metadata: { contentType: 'image/jpeg' } }),
      bucket.file(thumbPath).save(tinyBlob, { metadata: { contentType: 'image/jpeg' } }),
      bucket.file(dsPath).save(tinyBlob, { metadata: { contentType: 'application/pdf' } }),
    ]);

    await db.collection('products').doc(product.id).collection('photos').add({
      storagePath: photoPath,
      thumbStoragePath: thumbPath,
      name: 'cascade_photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 10,
      uploadedAt: new Date(),
      uploadedBy: 'e2e-test',
    });

    await db.collection('products').doc(product.id).collection('datasheets').add({
      storagePath: dsPath,
      name: 'cascade_ds.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      uploadedAt: new Date(),
      uploadedBy: 'e2e-test',
    });

    await navigateAndWaitReady(page);

    // Click the test product card
    const card = page.locator('.product-card', { hasText: product.model });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    await page.waitForSelector('.product-detail-form', { state: 'visible', timeout: 5000 });

    // Wait for media to load
    await page.waitForFunction(
      () => {
        const grid = document.querySelector('.product-photo-grid');
        const list = document.querySelector('.datasheet-list');
        return grid && !grid.textContent.includes('Laden') && list && !list.textContent.includes('Laden');
      },
      { timeout: 10_000 },
    );

    // Verify both exist before delete
    await expect(page.locator('.product-photo-grid .photo-item')).toHaveCount(1);
    await expect(page.locator('.datasheet-list .ds-row')).toHaveCount(1);

    // Handle confirm dialog for delete
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click delete product button
    await page.click('.detail-btn-delete');

    // Wait for product card to disappear
    await expect(card).toHaveCount(0, { timeout: 10_000 });

    // Verify product doc is gone
    const productDoc = await db.collection('products').doc(product.id).get();
    expect(productDoc.exists).toBe(false);

    // Verify photos subcollection is gone
    const photosSnap = await db.collection('products').doc(product.id).collection('photos').get();
    expect(photosSnap.size).toBe(0);

    // Verify datasheets subcollection is gone
    const dsSnap = await db.collection('products').doc(product.id).collection('datasheets').get();
    expect(dsSnap.size).toBe(0);

    // Verify storage blobs are gone
    const [photoExists] = await bucket.file(photoPath).exists();
    expect(photoExists).toBe(false);
    const [thumbExists] = await bucket.file(thumbPath).exists();
    expect(thumbExists).toBe(false);
    const [dsExists] = await bucket.file(dsPath).exists();
    expect(dsExists).toBe(false);
  });
});
