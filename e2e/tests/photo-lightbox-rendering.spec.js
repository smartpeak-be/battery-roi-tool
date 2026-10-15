import { test, expect } from '@playwright/test';

test('lightbox zoom rerenders the full image instead of scaling a cached layer', async ({ page }) => {
  await page.goto('/');
  await page.setContent(`
    <link rel="stylesheet" href="/assets/css/smartpeak.css">
    <div class="sp-lightbox open" id="pu-lightbox">
      <div class="pu-annotation-stage" data-pu-annotation-stage style="width:200px;height:100px">
        <img data-pu-lightbox-img alt="Testfoto"
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect width='800' height='400' fill='navy'/%3E%3C/svg%3E">
        <canvas data-pu-annotation-canvas width="800" height="400"></canvas>
      </div>
    </div>
  `);
  await page.waitForFunction(() => document.styleSheets.length > 0);

  const geometry = await page.evaluate(async () => {
    const { zoomRenderStyles } = await import('/assets/js/photo-lightbox-zoom.js');
    const stage = document.querySelector('[data-pu-annotation-stage]');
    const img = stage.querySelector('[data-pu-lightbox-img]');
    const canvas = stage.querySelector('[data-pu-annotation-canvas]');
    const styles = zoomRenderStyles({ scale: 2, x: -40, y: 10 });
    stage.style.transform = styles.stageTransform;
    for (const content of [img, canvas]) {
      content.style.width = styles.contentWidth;
      content.style.height = styles.contentHeight;
    }
    await img.decode();
    const stageRect = stage.getBoundingClientRect();
    const imageRect = img.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      transform: stage.style.transform,
      stage: { width: stage.offsetWidth, height: stage.offsetHeight },
      image: { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height },
      canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
      stageOrigin: { x: stageRect.x, y: stageRect.y },
    };
  });

  expect(geometry.transform).not.toContain('scale(');
  expect(geometry.image.width).toBeCloseTo(geometry.stage.width * 2, 0);
  expect(geometry.image.height).toBeCloseTo(geometry.stage.height * 2, 0);
  expect(geometry.canvas).toEqual(geometry.image);
  expect(geometry.image.x).toBeCloseTo(geometry.stageOrigin.x, 0);
  expect(geometry.image.y).toBeCloseTo(geometry.stageOrigin.y, 0);
});
