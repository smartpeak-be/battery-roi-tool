import { describe, expect, test } from 'vitest';
import {
  clampLightboxScale,
  getDistanceBetweenTouches,
  nextZoomTransform,
  panZoomTransform,
} from '../assets/js/photo-lightbox-zoom.js';

describe('photo lightbox zoom helpers', () => {
  test('clamps zoom between fit size and detail zoom', () => {
    expect(clampLightboxScale(0.2)).toBe(1);
    expect(clampLightboxScale(3)).toBe(3);
    expect(clampLightboxScale(12)).toBe(6);
  });

  test('calculates pinch distance between two touches', () => {
    expect(getDistanceBetweenTouches([
      { clientX: 10, clientY: 10 },
      { clientX: 13, clientY: 14 },
    ])).toBe(5);
  });

  test('zooms around the pointer so the inspected point stays under the finger or cursor', () => {
    const next = nextZoomTransform({
      current: { scale: 1, x: 0, y: 0 },
      nextScale: 2,
      origin: { x: 250, y: 150 },
      viewport: { width: 500, height: 300 },
    });

    expect(next).toEqual({ scale: 2, x: -250, y: -150 });
  });

  test('pans while zoomed in but resets pan at fit scale', () => {
    expect(panZoomTransform({ scale: 2, x: 10, y: -5 }, { dx: 20, dy: 15 }))
      .toEqual({ scale: 2, x: 30, y: 10 });

    expect(panZoomTransform({ scale: 1, x: 10, y: -5 }, { dx: 20, dy: 15 }))
      .toEqual({ scale: 1, x: 0, y: 0 });
  });
});
