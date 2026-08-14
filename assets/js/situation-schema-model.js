const SITUATION_VERSION = 1;
const SEGMENT_TYPES = new Set(['wall', 'window']);
const POINT_TYPES = new Set(['door', 'distribution-board', 'inverter', 'battery', 'earth']);
export const SITUATION_ELEMENT_TYPES = [...SEGMENT_TYPES, ...POINT_TYPES];

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
  const normalized = Math.round(number(value) / 90) * 90;
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

export function addSituationElement(situation, type, values = {}) {
  const next = normalizeSituation(situation);
  const element = normalizeElement(values, type);
  return element ? { ...next, elements: [...next.elements, element] } : next;
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
