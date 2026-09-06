const SITUATION_VERSION = 1;
const SEGMENT_TYPES = new Set(['wall', 'window']);
const POINT_TYPES = new Set(['door', 'distribution-board', 'inverter', 'battery', 'earth']);
export const SITUATION_ELEMENT_TYPES = [...SEGMENT_TYPES, ...POINT_TYPES];
export const SITUATION_GRID = 20;

const DEFAULT_LABELS = {
  wall: '', window: '', door: '',
  'distribution-board': 'Verdeelkast', inverter: 'Omvormer',
  battery: 'Batterij', earth: 'Aardingspunt',
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function string(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function id(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${value}`;
}

function rotation(value) {
  const normalized = Math.round(number(value) / 45) * 45;
  return ((normalized % 360) + 360) % 360;
}

function normalizeElement(raw = {}, forcedType = '') {
  const type = forcedType || raw?.type;
  if (!SEGMENT_TYPES.has(type) && !POINT_TYPES.has(type)) return null;
  const base = {
    id: string(raw.id, id(type)),
    type,
    label: string(raw.label, DEFAULT_LABELS[type]),
    rotation: rotation(raw.rotation),
    mirrored: raw.mirrored === true,
  };
  if (SEGMENT_TYPES.has(type)) {
    return {
      ...base,
      x1: number(raw.x1, 80), y1: number(raw.y1, 80),
      x2: number(raw.x2, 240), y2: number(raw.y2, 80),
    };
  }
  return { ...base, x: number(raw.x, 160), y: number(raw.y, 160) };
}

export function normalizeSituation(raw = {}) {
  return {
    version: SITUATION_VERSION,
    viewport: {
      width: positiveNumber(raw?.viewport?.width, 1120),
      height: positiveNumber(raw?.viewport?.height, 720),
    },
    elements: Array.isArray(raw?.elements) ? raw.elements.map(item => normalizeElement(item)).filter(Boolean) : [],
  };
}

export function createEmptySituation(viewport = {}) {
  return normalizeSituation({ viewport, elements: [] });
}

export function snapSituationPoint(point = {}, grid = SITUATION_GRID) {
  const step = positiveNumber(grid, SITUATION_GRID);
  return {
    x: Math.round(number(point.x) / step) * step,
    y: Math.round(number(point.y) / step) * step,
  };
}

export function constrainSituationSegment(start = {}, end = {}, grid = SITUATION_GRID) {
  const first = snapSituationPoint(start, grid);
  const target = snapSituationPoint(end, grid);
  const dx = target.x - first.x;
  const dy = target.y - first.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  let x2 = target.x;
  let y2 = target.y;
  if (absY <= absX * Math.tan(Math.PI / 8)) y2 = first.y;
  else if (absX <= absY * Math.tan(Math.PI / 8)) x2 = first.x;
  else {
    const distance = Math.max(absX, absY);
    x2 = first.x + Math.sign(dx || 1) * distance;
    y2 = first.y + Math.sign(dy || 1) * distance;
  }
  return { x1: first.x, y1: first.y, x2, y2 };
}

export function addSituationElement(situation, type, values = {}) {
  const next = normalizeSituation(situation);
  const element = normalizeElement(values, type);
  return element ? { ...next, elements: [...next.elements, element] } : next;
}

export function addSituationRectangle(situation, values = {}, grid = SITUATION_GRID) {
  const first = snapSituationPoint({ x: values.x1, y: values.y1 }, grid);
  const second = snapSituationPoint({ x: values.x2, y: values.y2 }, grid);
  const corners = [
    [first.x, first.y, second.x, first.y],
    [second.x, first.y, second.x, second.y],
    [second.x, second.y, first.x, second.y],
    [first.x, second.y, first.x, first.y],
  ];
  return corners.reduce((next, [x1, y1, x2, y2]) => addSituationElement(next, 'wall', { x1, y1, x2, y2 }), situation);
}

export function projectSituationPointToWall(situation, point = {}, maxDistance = 48) {
  const target = { x: number(point.x), y: number(point.y) };
  let nearest = null;
  normalizeSituation(situation).elements.filter(item => item.type === 'wall').forEach(wall => {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return;
    const t = Math.max(0, Math.min(1, ((target.x - wall.x1) * dx + (target.y - wall.y1) * dy) / lengthSquared));
    const projected = { x: wall.x1 + t * dx, y: wall.y1 + t * dy };
    const distance = Math.hypot(target.x - projected.x, target.y - projected.y);
    if (distance > maxDistance || (nearest && distance >= nearest.distance)) return;
    const angle = ((Math.round(Math.atan2(dy, dx) * 180 / Math.PI / 45) * 45) % 360 + 360) % 360;
    nearest = { ...projected, rotation: angle, wallId: wall.id, distance, t };
  });
  return nearest;
}

export function findSituationElement(situation, elementId) {
  return normalizeSituation(situation).elements.find(item => item.id === elementId) || null;
}

export function updateSituationElement(situation, elementId, patch = {}) {
  const next = normalizeSituation(situation);
  return {
    ...next,
    elements: next.elements.map(item => item.id === elementId
      ? normalizeElement({ ...item, ...patch, id: item.id, type: item.type })
      : item),
  };
}

export function transformSituationElement(situation, elementId, { dx = 0, dy = 0, rotate = 0, mirror = false } = {}) {
  const next = normalizeSituation(situation);
  return {
    ...next,
    elements: next.elements.map(item => {
      if (item.id !== elementId) return item;
      const changed = {
        ...item,
        rotation: rotation(item.rotation + number(rotate)),
        mirrored: mirror ? !item.mirrored : item.mirrored,
      };
      if (SEGMENT_TYPES.has(item.type)) {
        changed.x1 += number(dx); changed.x2 += number(dx);
        changed.y1 += number(dy); changed.y2 += number(dy);
        if (rotate) {
          const cx = (changed.x1 + changed.x2) / 2;
          const cy = (changed.y1 + changed.y2) / 2;
          const angle = number(rotate) * Math.PI / 180;
          const turn = (x, y) => ({ x: cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle), y: cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle) });
          const first = turn(changed.x1, changed.y1); const second = turn(changed.x2, changed.y2);
          changed.x1 = first.x; changed.y1 = first.y; changed.x2 = second.x; changed.y2 = second.y;
        }
      } else {
        changed.x += number(dx); changed.y += number(dy);
      }
      return normalizeElement(changed);
    }),
  };
}

export function deleteSituationElement(situation, elementId) {
  const next = normalizeSituation(situation);
  return { ...next, elements: next.elements.filter(item => item.id !== elementId) };
}
