// Helpers for installed battery/inverter solution selection and review display.

const RELEVANT_CATEGORY_SLUGS = new Set(['omvormers', 'batterijen', 'thuisbatterij-systemen']);

function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function productLabel(product = {}) {
  return [product.brand, product.model].map(cleanString).filter(Boolean).join(' ') || cleanString(product.name) || 'Product';
}

export function isRelevantSolutionProduct(product = {}, categoriesById = {}) {
  const category = categoriesById[product.categoryId] || {};
  const slug = cleanString(product.categorySlug || category.slug).toLowerCase();
  return RELEVANT_CATEGORY_SLUGS.has(slug);
}

export function productKind(product = {}, categoriesById = {}) {
  const category = categoriesById[product.categoryId] || {};
  const slug = cleanString(product.categorySlug || category.slug).toLowerCase();
  if (slug === 'omvormers') return 'inverter';
  if (slug === 'batterijen') return 'battery';
  if (slug === 'thuisbatterij-systemen') return 'system';
  return 'manual';
}

export function solutionProductOptions(products = [], categories = []) {
  const categoriesById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  return (products || [])
    .filter(p => p && p.isActive !== false && isRelevantSolutionProduct(p, categoriesById))
    .map(p => ({
      id: p.id,
      label: productLabel(p),
      kind: productKind(p, categoriesById),
      specs: p.specs || {},
      brand: p.brand || '',
      model: p.model || '',
      categoryId: p.categoryId || null,
      categorySlug: (categoriesById[p.categoryId] || {}).slug || p.categorySlug || '',
    }))
    .sort((a, b) => `${a.kind}-${a.label}`.localeCompare(`${b.kind}-${b.label}`, 'nl-BE'));
}

export function emptySolutionItem(kind = 'product') {
  return {
    id: `sol_${Math.random().toString(36).slice(2, 10)}`,
    source: kind === 'manual' ? 'manual' : 'product',
    kind: kind === 'manual' ? 'system' : 'product',
    productId: '',
    label: '',
    quantity: 1,
    inverterPowerKw: null,
    capacityKwh: null,
  };
}

export function normalizeInstalledSolution(solution = {}) {
  const items = Array.isArray(solution.items) ? solution.items : [];
  return {
    items: items.map((item, idx) => ({
      id: cleanString(item.id) || `sol_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      source: item.source === 'manual' ? 'manual' : 'product',
      kind: ['inverter', 'battery', 'system', 'product'].includes(item.kind) ? item.kind : 'product',
      productId: cleanString(item.productId),
      label: cleanString(item.label),
      quantity: Math.max(0, Math.trunc(toNumber(item.quantity, 1))),
      inverterPowerKw: item.inverterPowerKw == null ? null : toNumber(item.inverterPowerKw, null),
      capacityKwh: item.capacityKwh == null ? null : toNumber(item.capacityKwh, null),
      specs: item.specs && typeof item.specs === 'object' ? item.specs : {},
    })).filter(item => item.quantity > 0 && (item.productId || item.label || item.source === 'manual')),
  };
}

export function itemSnapshotFromProduct(option, quantity = 1) {
  const specs = option?.specs || {};
  return {
    id: `sol_${Math.random().toString(36).slice(2, 10)}`,
    source: 'product',
    kind: option?.kind || 'product',
    productId: option?.id || '',
    label: option?.label || '',
    quantity: Math.max(1, Math.trunc(toNumber(quantity, 1))),
    inverterPowerKw: specs.inverterPowerKw != null ? toNumber(specs.inverterPowerKw, null) : null,
    capacityKwh: specs.capacityKwh != null ? toNumber(specs.capacityKwh, null) : null,
    specs,
  };
}

export function calculateSolutionSummary(solution = {}) {
  const normalized = normalizeInstalledSolution(solution);
  let inverterPowerKw = 0;
  let storageKwh = 0;
  const labels = [];

  for (const item of normalized.items) {
    const qty = Math.max(0, Math.trunc(toNumber(item.quantity, 0)));
    const specs = item.specs || {};
    const powerKw = item.inverterPowerKw != null ? toNumber(item.inverterPowerKw, 0) : toNumber(specs.inverterPowerKw, 0);
    const capKwh = item.capacityKwh != null ? toNumber(item.capacityKwh, 0) : toNumber(specs.capacityKwh, 0);
    inverterPowerKw += qty * powerKw;
    storageKwh += qty * capKwh;
    if (item.label) labels.push(`${qty}× ${item.label}`);
  }

  const inverterPowerW = Math.round(inverterPowerKw * 1000);
  const summaryParts = [];
  if (inverterPowerW > 0) summaryParts.push(`geplaatst omvormvermogen ${inverterPowerW} W`);
  if (storageKwh > 0) summaryParts.push(`geplaatste opslag ${round(storageKwh, 2)} kWh`);

  return {
    inverterPowerKw: round(inverterPowerKw, 3),
    inverterPowerW,
    storageKwh: round(storageKwh, 2),
    labels,
    publicLabel: summaryParts.join(' · '),
  };
}

export function solutionSummaryLabel(summary = {}) {
  if (summary.publicLabel) return summary.publicLabel;
  const parts = [];
  if (Number(summary.inverterPowerW) > 0) parts.push(`geplaatst omvormvermogen ${Math.round(Number(summary.inverterPowerW))} W`);
  if (Number(summary.storageKwh) > 0) parts.push(`geplaatste opslag ${round(Number(summary.storageKwh), 2)} kWh`);
  return parts.join(' · ');
}
