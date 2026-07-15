/* global URLSearchParams */
function normalizeQty(value) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

export function calculatorConfigSpecItems(cfg) {
  const compositionLines = Array.isArray(cfg?.compositionLines) ? cfg.compositionLines : [];
  const directProductLines = compositionLines.filter(line => line?.kind === 'product' && line?.productId);
  const source = directProductLines.length ? directProductLines : (Array.isArray(cfg?.items) ? cfg.items : []);
  const quantities = new Map();

  source.forEach(item => {
    const productId = String(item?.productId || '').trim();
    const qty = normalizeQty(item?.qty);
    if (!productId || qty <= 0) return;
    quantities.set(productId, (quantities.get(productId) || 0) + qty);
  });

  return Array.from(quantities, ([productId, qty]) => ({ productId, qty }));
}

export function calculatorConfigSpecsUrl(cfg, page = 'producten.html') {
  const type = String(cfg?.type || '').trim();
  const items = calculatorConfigSpecItems(cfg);
  if (!type && !items.length) return '';
  if (!items.length && (cfg?.isManual || type.startsWith('CUSTOM_'))) return '';

  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (items.length) params.set('items', JSON.stringify(items));

  const name = String(cfg?.omschrijving || cfg?.productConfigName || cfg?.name || '').trim();
  if (items.length && name) params.set('name', name);

  return `${page}?${params.toString()}`;
}
