const DRAWING_VERSION = 1;

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

function normalizeCircuit(raw = {}) {
  return {
    id: cleanString(raw.id, createId('circuit')),
    type: 'circuit',
    label: cleanString(raw.label, 'Nieuwe kring'),
    cable: cleanString(raw.cable, '3G2,5'),
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
  };
}

function normalizeBreaker(raw = {}) {
  return {
    id: cleanString(raw.id, createId('breaker')),
    type: 'breaker',
    label: cleanString(raw.label, 'Nieuwe zekering'),
    amperage: cleanNumber(raw.amperage, 20),
    poles: cleanNumber(raw.poles, 2),
    curve: cleanString(raw.curve, 'C'),
    circuits: Array.isArray(raw.circuits) ? raw.circuits.map(normalizeCircuit) : [],
  };
}

function normalizeDifferential(raw = {}) {
  return {
    id: cleanString(raw.id, createId('diff')),
    type: 'differential',
    label: cleanString(raw.label, 'Nieuw differentieel'),
    amperage: cleanNumber(raw.amperage, 40),
    sensitivityMa: cleanNumber(raw.sensitivityMa, 300),
    poles: cleanNumber(raw.poles, 4),
    breakers: Array.isArray(raw.breakers) ? raw.breakers.map(normalizeBreaker) : [],
  };
}

export function normalizeDrawing(raw = {}) {
  return {
    version: DRAWING_VERSION,
    title: cleanString(raw.title, 'Eendraadschema'),
    projectId: typeof raw.projectId === 'string' && raw.projectId.trim() ? raw.projectId.trim() : null,
    differentials: Array.isArray(raw.differentials) ? raw.differentials.map(normalizeDifferential) : [],
  };
}

export function createEmptyDrawing({ projectId = null, title = 'Eendraadschema' } = {}) {
  return normalizeDrawing({ projectId, title, differentials: [] });
}

export function addDifferential(drawing, values = {}) {
  const next = normalizeDrawing(drawing);
  return { ...next, differentials: [...next.differentials, normalizeDifferential(values)] };
}

export function addBreaker(drawing, differentialId, values = {}) {
  const next = normalizeDrawing(drawing);
  return {
    ...next,
    differentials: next.differentials.map(diff => diff.id === differentialId
      ? { ...diff, breakers: [...diff.breakers, normalizeBreaker(values)] }
      : diff),
  };
}

export function addCircuit(drawing, breakerId, values = {}) {
  const next = normalizeDrawing(drawing);
  return {
    ...next,
    differentials: next.differentials.map(diff => ({
      ...diff,
      breakers: diff.breakers.map(breaker => breaker.id === breakerId
        ? { ...breaker, circuits: [...breaker.circuits, normalizeCircuit(values)] }
        : breaker),
    })),
  };
}

export function findElement(drawing, id) {
  const normalized = normalizeDrawing(drawing);
  for (const diff of normalized.differentials) {
    if (diff.id === id) return { type: 'differential', element: diff, parentId: null };
    for (const breaker of diff.breakers) {
      if (breaker.id === id) return { type: 'breaker', element: breaker, parentId: diff.id };
      for (const circuit of breaker.circuits) {
        if (circuit.id === id) return { type: 'circuit', element: circuit, parentId: breaker.id };
      }
    }
  }
  return null;
}

export function updateElement(drawing, id, patch = {}) {
  const next = normalizeDrawing(drawing);
  const updateCircuit = circuit => circuit.id === id ? normalizeCircuit({ ...circuit, ...patch, id: circuit.id }) : circuit;
  const updateBreaker = breaker => breaker.id === id
    ? normalizeBreaker({ ...breaker, ...patch, id: breaker.id })
    : { ...breaker, circuits: breaker.circuits.map(updateCircuit) };
  return {
    ...next,
    differentials: next.differentials.map(diff => diff.id === id
      ? normalizeDifferential({ ...diff, ...patch, id: diff.id })
      : { ...diff, breakers: diff.breakers.map(updateBreaker) }),
  };
}

export function deleteElement(drawing, id) {
  const next = normalizeDrawing(drawing);
  return {
    ...next,
    differentials: next.differentials
      .filter(diff => diff.id !== id)
      .map(diff => ({
        ...diff,
        breakers: diff.breakers
          .filter(breaker => breaker.id !== id)
          .map(breaker => ({ ...breaker, circuits: breaker.circuits.filter(circuit => circuit.id !== id) })),
      })),
  };
}

function reorder(items, id, direction) {
  const index = items.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function moveElement(drawing, id, direction) {
  const step = direction < 0 ? -1 : 1;
  const next = normalizeDrawing(drawing);
  const found = findElement(next, id);
  if (!found) return next;
  if (found.type === 'differential') return { ...next, differentials: reorder(next.differentials, id, step) };
  return {
    ...next,
    differentials: next.differentials.map(diff => ({
      ...diff,
      breakers: found.type === 'breaker' && diff.id === found.parentId
        ? reorder(diff.breakers, id, step)
        : diff.breakers.map(breaker => ({
          ...breaker,
          circuits: found.type === 'circuit' && breaker.id === found.parentId
            ? reorder(breaker.circuits, id, step)
            : breaker.circuits,
        })),
    })),
  };
}
