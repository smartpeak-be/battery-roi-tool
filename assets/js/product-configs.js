import { totalProductPrice } from './product-pricing.js';

export const SERVICE_CATEGORY_SLUG = 'service';
export const BATTERY_CATEGORY_SLUGS = new Set(['batterijen', 'thuisbatterij-systemen']);

export function productLabel(product) {
  if (!product) return '';
  return [product.brand, product.model].filter(Boolean).join(' ').trim()
    || product.description
    || '(product zonder naam)';
}

export function productMap(products) {
  return Object.fromEntries((products || []).map(p => [p.id, p]));
}

export function categoryMap(categories) {
  return Object.fromEntries((categories || []).map(c => [c.id, c]));
}

export function isServiceProduct(product, categoriesById) {
  const cat = product && categoriesById && categoriesById[product.categoryId];
  return (cat && cat.slug) === SERVICE_CATEGORY_SLUG;
}

export function isBatteryProduct(product, categoriesById) {
  const cat = product && categoriesById && categoriesById[product.categoryId];
  return !!(cat && BATTERY_CATEGORY_SLUGS.has(cat.slug));
}

export function normalizeConfigItems(items) {
  return (items || [])
    .map(item => ({
      productId: item && item.productId ? String(item.productId) : '',
      qty: Math.max(0, parseInt(item && item.qty, 10) || 0),
    }))
    .filter(item => item.productId && item.qty > 0);
}

export function generatedConfigDescription(items, productsById, categoriesById = {}) {
  const parts = normalizeConfigItems(items)
    .map(item => {
      const product = productsById && productsById[item.productId];
      if (!product || isServiceProduct(product, categoriesById)) return '';
      return `${item.qty}x ${productLabel(product)}`;
    })
    .filter(Boolean);
  return parts.join(' & ');
}

export function configSubtotalExVat(items, productsById, categoriesById = {}) {
  return normalizeConfigItems(items).reduce((sum, item) => {
    const product = productsById && productsById[item.productId];
    if (!product || isServiceProduct(product, categoriesById)) return sum;
    return sum + totalProductPrice(product, item.qty);
  }, 0);
}

export function configBatteryWeightKg(items, productsById, categoriesById = {}) {
  return normalizeConfigItems(items).reduce((sum, item) => {
    const product = productsById && productsById[item.productId];
    if (!product || !isBatteryProduct(product, categoriesById)) return sum;
    return sum + item.qty * ((product.specs && Number(product.specs.weightKg)) || 0);
  }, 0);
}

export function bebatTotalInclVat(weightKg, bebatPricePerKg) {
  return Math.max(0, Number(weightKg) || 0) * Math.max(0, Number(bebatPricePerKg) || 0) * 1.21;
}

export function findServiceProduct(products, serviceKey) {
  return (products || []).find(p => p.serviceKey === serviceKey && p.isActive !== false) || null;
}

export function serviceProductPrice(product) {
  return product ? totalProductPrice(product, 1) : 0;
}
