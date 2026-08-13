const DRAWING_VERSION = 2;
export const ENDPOINT_TYPES = ['circuit', 'battery', 'inverter', 'hybrid-inverter'];

function cleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createId(prefix = 'item') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function normalizeMainBreaker(raw = {}) {
  return {
    id: cleanString(raw?.id, 'main-breaker'),
    type: 'main-breaker',
    label: cleanString(raw?.label, 'Hoofdautomaat'),
    amperage: cleanNumber(raw?.amperage, 40),
    poles: cleanNumber(raw?.poles, 4),
    curve: cleanString(raw?.curve, 'C'),
  };
}

function normalizeBreaker(raw = {}) {
  return {
    id: cleanString(raw?.id, createId('breaker')),
    type: 'breaker',
    label: cleanString(raw?.label, 'Automaat'),
    amperage: cleanNumber(raw?.amperage, 20),
    poles: cleanNumber(raw?.poles, 2),
    curve: cleanString(raw?.curve, 'C'),
  };
}

const ENDPOINT_DEFAULTS = {
  circuit: { label: 'Gewone kring', cable: '3G2,5' },
  battery: { label: 'Batterij', cable: '3G2,5', powerKw: 2.4, capacityKwh: 5 },
  inverter: { label: 'Omvormer', cable: '3G2,5', powerKw: 5 },
  'hybrid-inverter': { label: 'Hybride omvormer', cable: '5G2,5', powerKw: 5, capacityKwh: 5 },
};

function normalizeEndpoint(raw = {}, forcedType = '') {
  const type = ENDPOINT_TYPES.includes(forcedType || raw?.type) ? (forcedType || raw.type) : 'circuit';
  const defaults = ENDPOINT_DEFAULTS[type];
  return {
    id: cleanString(raw?.id, createId('endpoint')),
    type,
    label: cleanString(raw?.label, defaults.label),
    cable: cleanString(raw?.cable, defaults.cable),
    brand: typeof raw?.brand === 'string' ? raw.brand.trim() : '',
    model: typeof raw?.model === 'string' ? raw.model.trim() : '',
    serialNumber: typeof raw?.serialNumber === 'string' ? raw.serialNumber.trim() : '',
    powerKw: type === 'circuit' ? null : cleanNumber(raw?.powerKw, defaults.powerKw),
    capacityKwh: ['battery', 'hybrid-inverter'].includes(type) ? cleanNumber(raw?.capacityKwh, defaults.capacityKwh) : null,
    note: typeof raw?.note === 'string' ? raw.note.trim() : '',
  };
}

function normalizeBranch(raw = {}, forcedType = '') {
  const endpoint = normalizeEndpoint(raw?.endpoint || {}, forcedType);
  return {
    id: cleanString(raw?.id, createId('branch')),
    type: 'branch',
    breaker: normalizeBreaker(raw?.breaker || {}),
    endpoint,
  };
}

function legacyBranches(raw) {
  if (Array.isArray(raw?.branches)) return raw.branches.map(branch => normalizeBranch(branch));
  if (!Array.isArray(raw?.breakers)) return [];
  return raw.breakers.flatMap(breaker => {
    const circuits = Array.isArray(breaker.circuits) && breaker.circuits.length ? breaker.circuits : [{}];
    return circuits.map(circuit => normalizeBranch({
      id: createId('branch'),
      breaker,
      endpoint: { ...circuit, type: 'circuit' },
    }));
  });
}

function normalizeDifferential(raw = {}) {
  return {
    id: cleanString(raw?.id, createId('diff')),
    type: 'differential',
    label: cleanString(raw?.label, 'Differentieel'),
    amperage: cleanNumber(raw?.amperage, 40),
    sensitivityMa: cleanNumber(raw?.sensitivityMa, 300),
    poles: cleanNumber(raw?.poles, 4),
    cable: cleanString(raw?.cable, '4x10'),
    branches: legacyBranches(raw),
    differentials: Array.isArray(raw?.differentials) ? raw.differentials.map(normalizeDifferential) : [],
  };
}

export function normalizeDrawing(raw = {}) {
  return {
    version: DRAWING_VERSION,
    title: cleanString(raw?.title, 'Eendraadschema'),
    projectId: typeof raw?.projectId === 'string' && raw.projectId.trim() ? raw.projectId.trim() : null,
    mainBreaker: normalizeMainBreaker(raw?.mainBreaker || {}),
    differentials: Array.isArray(raw?.differentials) ? raw.differentials.map(normalizeDifferential) : [],
  };
}

export function createEmptyDrawing({ projectId = null, title = 'Eendraadschema' } = {}) {
  return normalizeDrawing({ projectId, title });
}

function mapDifferentials(items, targetId, callback) {
  return items.map(diff => {
    if (diff.id === targetId) return callback(diff);
    return { ...diff, differentials: mapDifferentials(diff.differentials, targetId, callback) };
  });
}

export function addDifferential(drawing, parentDifferentialId = null, values = {}) {
  const next = normalizeDrawing(drawing);
  const child = normalizeDifferential(values);
  if (!parentDifferentialId) return { ...next, differentials: [...next.differentials, child] };
  return {
    ...next,
    differentials: mapDifferentials(next.differentials, parentDifferentialId, diff => ({
      ...diff, differentials: [...diff.differentials, child],
    })),
  };
}

export function addBranch(drawing, differentialId, endpointType = 'circuit', values = {}) {
  const next = normalizeDrawing(drawing);
  const branch = normalizeBranch(values, endpointType);
  return {
    ...next,
    differentials: mapDifferentials(next.differentials, differentialId, diff => ({
      ...diff, branches: [...diff.branches, branch],
    })),
  };
}

// Compatibility helpers for v1 callers.
export function addBreaker(drawing, differentialId, values = {}) {
  return addBranch(drawing, differentialId, 'circuit', { breaker: values });
}

export function addCircuit(drawing, breakerId, values = {}) {
  const found = findElement(drawing, breakerId);
  if (!found || found.type !== 'breaker') return normalizeDrawing(drawing);
  return updateElement(drawing, found.branchId, { endpoint: normalizeEndpoint(values, 'circuit') });
}

function findInDifferentials(items, id, parentId = null) {
  for (const diff of items) {
    if (diff.id === id) return { type: 'differential', element: diff, parentId };
    for (const branch of diff.branches) {
      if (branch.id === id) return { type: 'branch', element: branch, parentId: diff.id };
      if (branch.breaker.id === id) return { type: 'breaker', element: branch.breaker, parentId: diff.id, branchId: branch.id };
      if (branch.endpoint.id === id) return { type: branch.endpoint.type, element: branch.endpoint, parentId: branch.breaker.id, branchId: branch.id };
    }
    const nested = findInDifferentials(diff.differentials, id, diff.id);
    if (nested) return nested;
  }
  return null;
}

export function findElement(drawing, id) {
  const normalized = normalizeDrawing(drawing);
  if (normalized.mainBreaker.id === id) return { type: 'main-breaker', element: normalized.mainBreaker, parentId: null };
  return findInDifferentials(normalized.differentials, id);
}

function updateDifferentials(items, id, patch) {
  return items.map(diff => {
    if (diff.id === id) return normalizeDifferential({ ...diff, ...patch, id: diff.id });
    return {
      ...diff,
      branches: diff.branches.map(branch => {
        if (branch.id === id) return normalizeBranch({ ...branch, ...patch, id: branch.id });
        if (branch.breaker.id === id) return { ...branch, breaker: normalizeBreaker({ ...branch.breaker, ...patch, id: branch.breaker.id }) };
        if (branch.endpoint.id === id) return { ...branch, endpoint: normalizeEndpoint({ ...branch.endpoint, ...patch, id: branch.endpoint.id }, branch.endpoint.type) };
        return branch;
      }),
      differentials: updateDifferentials(diff.differentials, id, patch),
    };
  });
}

export function updateElement(drawing, id, patch = {}) {
  const next = normalizeDrawing(drawing);
  if (next.mainBreaker.id === id) return { ...next, mainBreaker: normalizeMainBreaker({ ...next.mainBreaker, ...patch }) };
  return { ...next, differentials: updateDifferentials(next.differentials, id, patch) };
}

function deleteFromDifferentials(items, id) {
  return items
    .filter(diff => diff.id !== id)
    .map(diff => ({
      ...diff,
      branches: diff.branches.filter(branch => ![branch.id, branch.breaker.id, branch.endpoint.id].includes(id)),
      differentials: deleteFromDifferentials(diff.differentials, id),
    }));
}

export function deleteElement(drawing, id) {
  const next = normalizeDrawing(drawing);
  if (id === next.mainBreaker.id) return next;
  return { ...next, differentials: deleteFromDifferentials(next.differentials, id) };
}

function reorder(items, id, direction) {
  const index = items.findIndex(item => item.id === id);
  const target = index + (direction < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

function moveInDifferentials(items, found, id, direction) {
  return items.map(diff => ({
    ...diff,
    branches: found.type === 'branch' && diff.id === found.parentId ? reorder(diff.branches, id, direction) : diff.branches,
    differentials: found.type === 'differential' && diff.id === found.parentId
      ? reorder(diff.differentials, id, direction)
      : moveInDifferentials(diff.differentials, found, id, direction),
  }));
}

export function moveElement(drawing, id, direction) {
  const next = normalizeDrawing(drawing);
  const found = findElement(next, id);
  if (!found) return next;
  if (found.type === 'differential' && !found.parentId) return { ...next, differentials: reorder(next.differentials, id, direction) };
  const movableId = found.branchId || id;
  const movable = found.branchId ? { type: 'branch', parentId: findElement(next, found.branchId)?.parentId } : found;
  return { ...next, differentials: moveInDifferentials(next.differentials, movable, movableId, direction) };
}
