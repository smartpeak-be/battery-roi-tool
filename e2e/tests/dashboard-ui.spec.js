// e2e/tests/dashboard-ui.spec.js
import { test, expect } from '../helpers/auth-fixture.js';
import { createTestProject, cleanupProject } from '../helpers/project-helpers.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTO_PATH = resolve(__dirname, '../fixtures/test-photo.jpg');

let projectId;
let customerName;

test.describe('Dashboard UI', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await createTestProject(page, {
      customerName: `E2E_DASH_${Date.now()}`,
    });
    projectId = result.projectId;
    customerName = result.customerName;
    await page.close();
    await context.close();
  });

  test.afterAll(async () => {
    await cleanupProject(projectId);
  });

  test('search filters projects', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForSelector('.projectNameBtn', { state: 'visible', timeout: 15_000 });

    // Type the unique E2E name
    await page.fill('#projectSearch', customerName);
    await page.waitForTimeout(500);

    // Should see exactly our project
    const matchingBtn = page.locator(`.projectNameBtn[data-id="${projectId}"]`);
    await expect(matchingBtn).toBeVisible();

    // Other projects should be hidden (search filters)
    const allVisible = page.locator('.projectNameBtn:visible');
    const visibleCount = await allVisible.count();
    expect(visibleCount).toBe(1);
  });

  test('lijst/bord toggle', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForSelector('.projectNameBtn', { state: 'visible', timeout: 15_000 });

    // Default is list view — verify project table exists
    const table = page.locator('#projectList table');
    await expect(table).toBeVisible();

    // Switch to board view (only works on >= lg viewport)
    await page.setViewportSize({ width: 1200, height: 800 });
    const bordBtn = page.locator('#viewToggle button[data-view="board"]');

    if (await bordBtn.isVisible().catch(() => false)) {
      await bordBtn.click();
      await page.waitForTimeout(500);

      // Verify kanban board appears
      const board = page.locator('.kanban-board');
      await expect(board).toBeVisible();

      // Verify columns exist
      const columns = page.locator('.kanban-col');
      const colCount = await columns.count();
      expect(colCount).toBeGreaterThanOrEqual(3);

      // Switch back to list
      const lijstBtn = page.locator('#viewToggle button[data-view="list"]');
      await lijstBtn.click();
      await page.waitForTimeout(500);

      // Verify table is back
      await expect(table).toBeVisible();
    }
  });

  test('photo upload in drawer', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForSelector('.projectNameBtn', { state: 'visible', timeout: 15_000 });

    // Open drawer
    await page.fill('#projectSearch', customerName);
    await page.waitForTimeout(500);
    await page.click(`.projectNameBtn[data-id="${projectId}"]`);
    await page.waitForSelector('#drawer.show', { timeout: 10_000 });

    // Scroll to photo section
    const photoSection = page.locator('#drawerPhotoUploader');
    await photoSection.scrollIntoViewIfNeeded();

    // Upload a test photo via the gallery file input (not the camera one)
    const fileInput = photoSection.locator('input[type="file"][data-pu-gallery]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(PHOTO_PATH);

      // Wait for upload + tag modal or grid update
      await page.waitForTimeout(5000);

      // If tag modal appears, close it (click Save/OK)
      const tagModal = page.locator('.modal.show');
      if (await tagModal.isVisible().catch(() => false)) {
        const saveBtn = tagModal.locator('button:has-text("Opslaan"), button:has-text("OK"), .btn-primary');
        if (await saveBtn.count() > 0) {
          await saveBtn.first().click();
          await page.waitForTimeout(1000);
        }
      }

      // Verify at least one photo thumbnail appears in the grid
      const photoThumb = photoSection.locator('.photo-grid img, .photo-grid .photo-thumb');
      const thumbCount = await photoThumb.count();
      expect(thumbCount).toBeGreaterThanOrEqual(1);

      // Open the dashboard lightbox and verify the zoom affordance works.
      await photoThumb.first().click();
      const lightbox = page.locator('#pu-lightbox.open');
      await expect(lightbox).toBeVisible();
      await lightbox.locator('.zoom').click();
      await expect(lightbox).toHaveClass(/is-zoomed/);
      await expect(lightbox.locator('[data-pu-annotation-stage]')).toHaveAttribute('style', /scale\(2\)/);

      // Drawing without pressing Opslaan should ask explicitly whether to save or discard.
      await lightbox.locator('.zoom').click();
      await lightbox.locator('.annotate').click();
      const canvas = lightbox.locator('[data-pu-annotation-canvas]');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box.x + 30, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 90, box.y + 70);
      await page.mouse.up();
      await lightbox.locator('.close').click();
      const confirm = page.locator('.sp-confirm-dialog');
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText('Opslaan en sluiten');
      await expect(confirm).toContainText('Niet opslaan');
      await confirm.locator('button:has-text("Verder tekenen")').click();
      await expect(lightbox).toBeVisible();

      await lightbox.locator('.close').click();
      await page.locator('.sp-confirm-dialog button:has-text("Opslaan en sluiten")').click();
      await expect(lightbox).toBeHidden({ timeout: 15_000 });
      await expect(page.locator('.toast')).toContainText('Aantekening opgeslagen', { timeout: 15_000 });
    }
  });

  test('comments in drawer', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForSelector('.projectNameBtn', { state: 'visible', timeout: 15_000 });

    // Open drawer
    await page.fill('#projectSearch', customerName);
    await page.waitForTimeout(500);
    await page.click(`.projectNameBtn[data-id="${projectId}"]`);
    await page.waitForSelector('#drawer.show', { timeout: 10_000 });

    // Scroll to comments section
    const commentInput = page.locator('#drawerCommentInput');
    await commentInput.scrollIntoViewIfNeeded();

    // Type a comment
    const commentText = `E2E test comment ${Date.now()}`;
    await commentInput.fill(commentText);

    // Submit
    await page.click('#drawerCommentSubmit');
    await page.waitForTimeout(2000);

    // Verify comment appears in list
    const commentsList = page.locator('#drawerCommentsList');
    await expect(commentsList).toContainText(commentText);
  });
});
