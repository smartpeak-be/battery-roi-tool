const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function clampLightboxScale(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

export function getDistanceBetweenTouches(touches) {
  if (!touches || touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot((b.clientX || 0) - (a.clientX || 0), (b.clientY || 0) - (a.clientY || 0));
}

export function midpointBetweenTouches(touches) {
  if (!touches || touches.length < 2) return null;
  const [a, b] = touches;
  return {
    x: ((a.clientX || 0) + (b.clientX || 0)) / 2,
    y: ((a.clientY || 0) + (b.clientY || 0)) / 2,
  };
}

function normalizeZoom(zoom) {
  return {
    scale: clampLightboxScale(zoom?.scale ?? 1),
    x: Number(zoom?.x) || 0,
    y: Number(zoom?.y) || 0,
  };
}

export function nextZoomTransform({ current, nextScale, origin, viewport }) {
  const from = normalizeZoom(current);
  const scale = clampLightboxScale(nextScale);
  if (scale === MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };

  const width = Math.max(1, Number(viewport?.width) || 1);
  const height = Math.max(1, Number(viewport?.height) || 1);
  const ox = Number.isFinite(Number(origin?.x)) ? Number(origin.x) : width / 2;
  const oy = Number.isFinite(Number(origin?.y)) ? Number(origin.y) : height / 2;
  const scaleRatio = scale / from.scale;

  return {
    scale,
    x: ox - (ox - from.x) * scaleRatio,
    y: oy - (oy - from.y) * scaleRatio,
  };
}

export function nextPinchZoomTransform({ start, startDistance, distance, startOrigin, origin }) {
  const from = normalizeZoom(start);
  const initialDistance = Math.max(1, Number(startDistance) || 1);
  const currentDistance = Math.max(1, Number(distance) || initialDistance);
  const scale = clampLightboxScale(from.scale * (currentDistance / initialDistance));
  if (scale === MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };

  const sx = Number(startOrigin?.x) || 0;
  const sy = Number(startOrigin?.y) || 0;
  const ox = Number.isFinite(Number(origin?.x)) ? Number(origin.x) : sx;
  const oy = Number.isFinite(Number(origin?.y)) ? Number(origin.y) : sy;
  const contentX = (sx - from.x) / from.scale;
  const contentY = (sy - from.y) / from.scale;

  return {
    scale,
    x: ox - contentX * scale,
    y: oy - contentY * scale,
  };
}

export function panZoomTransform(current, delta) {
  const scale = clampLightboxScale(current?.scale ?? 1);
  if (scale === MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };
  return {
    scale,
    x: (Number(current?.x) || 0) + (Number(delta?.dx) || 0),
    y: (Number(current?.y) || 0) + (Number(delta?.dy) || 0),
  };
}
