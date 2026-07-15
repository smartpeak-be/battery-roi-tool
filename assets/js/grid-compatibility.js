// Canonical Belgian low-voltage grid connection types used by projects,
// product compatibility and calculator composition filtering.
export const GRID_CONNECTION_TYPES = Object.freeze([
  Object.freeze({
    value: '1x230',
    label: '1×230 V L + N',
    description: '230 V tussen fase en nul; ongeveer 230 V L-PE en 0 V N-PE.',
  }),
  Object.freeze({
    value: '1x230-delta',
    label: '1×230 V uit 3×230 V delta (2 fasen, zonder N)',
    description: '230 V tussen twee fasen; typisch ongeveer 133 V van elke fase naar PE.',
  }),
  Object.freeze({
    value: '3x230',
    label: '3×230 V delta (zonder N)',
    description: '230 V tussen de drie fasen; typisch ongeveer 133 V van elke fase naar PE.',
  }),
  Object.freeze({
    value: '3x400+N',
    label: '3×400 V + N',
    description: '400 V tussen fasen en 230 V tussen fase en nul.',
  }),
]);

const GRID_VALUES = new Set(GRID_CONNECTION_TYPES.map(type => type.value));
const GRID_ALIASES = new Map([
  ['1x230', '1x230'],
  ['1×230', '1x230'],
  ['1x230-ln', '1x230'],
  ['1x230-delta', '1x230-delta'],
  ['1×230-delta', '1x230-delta'],
  ['3x230', '3x230'],
  ['3×230', '3x230'],
  ['3x230-delta', '3x230'],
  ['3x400+n', '3x400+N'],
  ['3×400+n', '3x400+N'],
  ['3x400+N', '3x400+N'],
]);

export function normalizeGridConnectionType(value) {
  const raw = String(value || '').trim();
  return GRID_ALIASES.get(raw) || GRID_ALIASES.get(raw.toLowerCase()) || '';
}

export function normalizeGridCompatibility(values) {
  const input = Array.isArray(values) ? values : (values ? [values] : []);
  const normalized = new Set(input.map(normalizeGridConnectionType).filter(value => GRID_VALUES.has(value)));
  return GRID_CONNECTION_TYPES.map(type => type.value).filter(value => normalized.has(value));
}

export function gridConnectionLabel(value) {
  const normalized = normalizeGridConnectionType(value);
  return GRID_CONNECTION_TYPES.find(type => type.value === normalized)?.label || String(value || '');
}

export function productGridCompatibility(product) {
  return normalizeGridCompatibility(product?.gridCompatibility || product?.specs?.gridCompatibility || []);
}

export function productSupportsGridConnection(product, connectionType) {
  const requested = normalizeGridConnectionType(connectionType);
  if (!requested) return true;
  const compatibility = productGridCompatibility(product);
  return compatibility.length === 0 || compatibility.includes(requested);
}

export function productConfigGridCompatibility(config, productsById = {}) {
  const constrained = (config?.items || [])
    .map(item => productsById[item?.productId])
    .filter(Boolean)
    .map(productGridCompatibility)
    .filter(values => values.length > 0);

  if (!constrained.length) {
    return { gridCompatibility: [], constrainedProductCount: 0, hasConflict: false };
  }

  const intersection = GRID_CONNECTION_TYPES
    .map(type => type.value)
    .filter(value => constrained.every(values => values.includes(value)));

  return {
    gridCompatibility: intersection,
    constrainedProductCount: constrained.length,
    hasConflict: intersection.length === 0,
  };
}

export function productConfigSupportsGridConnection(config, productsById = {}, connectionType = '') {
  const requested = normalizeGridConnectionType(connectionType);
  if (!requested) return true;
  const compatibility = productConfigGridCompatibility(config, productsById);
  if (compatibility.constrainedProductCount === 0) return true;
  return compatibility.gridCompatibility.includes(requested);
}
