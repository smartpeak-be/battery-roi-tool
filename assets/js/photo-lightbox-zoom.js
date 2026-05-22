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

export function nextZoomTransform({ current, nextScale, origin, viewport }) {
  const from = {
    scale: clampLightboxScale(current?.scale ?? 1),
    x: Number(current?.x) || 0,
    y: Number(current?.y) || 0,
  };
  const scale = clampLightboxScale(nextScale);
  if (scale === MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };

  const width = Math.max(1, Number(viewport?.width) || 1);
  const height = Math.max(1, Number(viewport?.height) || 1);
  const ox = Number(origin?.x) || width / 2;
  const oy = Number(origin?.y) || height / 2;
  const scaleRatio = scale / from.scale;

  return {
    scale,
    x: ox - (ox - from.x) * scaleRatio,
    y: oy - (oy - from.y) * scaleRatio,
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
