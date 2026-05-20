import { totalProductPrice } from './product-pricing.js';

export const SERVICE_CATEGORY_SLUG = 'service';
export const MATERIAL_CATEGORY_SLUG = 'materiaal';
export const MISC_CATEGORY_SLUG = 'diversen';
export const BATTERY_CATEGORY_SLUGS = new Set(['batterijen', 'thuisbatterij-systemen']);

export function productLabel(product, categoriesById = {}) {
  if (!product) return '';
  const cat = categoriesById && categoriesById[product.categoryId];
  if (product.serviceKey || (cat && (
    cat.slug === SERVICE_CATEGORY_SLUG
    || cat.slug === MATERIAL_CATEGORY_SLUG
    || cat.slug === MISC_CATEGORY_SLUG
  ))) {
    return product.model
      || product.description
      || '(product zonder omschrijving)';
  }
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
      if (!product) return '';
      const label = productLabel(product, categoriesById);
      return item.qty === 1 ? label : `${item.qty}x ${label}`;
    })
    .filter(Boolean);
  return parts.join(' & ');
}

export function configSubtotalExVat(items, productsById) {
  return normalizeConfigItems(items).reduce((sum, item) => {
    const product = productsById && productsById[item.productId];
    if (!product) return sum;
    return sum + totalProductPrice(product, item.qty);
  }, 0);
}

export function configItemsForCategorySlug(items, productsById, categoriesById = {}, slug) {
  return normalizeConfigItems(items).filter(item => {
    const product = productsById && productsById[item.productId];
    const cat = product && categoriesById && categoriesById[product.categoryId];
    return !!(cat && cat.slug === slug);
  });
}

export function configItemsExceptCategorySlug(items, productsById, categoriesById = {}, slug) {
  return normalizeConfigItems(items).filter(item => {
    const product = productsById && productsById[item.productId];
    const cat = product && categoriesById && categoriesById[product.categoryId];
    return product && (!cat || cat.slug !== slug);
  });
}

export function configItemsExceptCategorySlugs(items, productsById, categoriesById = {}, slugs = []) {
  const excluded = new Set(slugs);
  return normalizeConfigItems(items).filter(item => {
    const product = productsById && productsById[item.productId];
    const cat = product && categoriesById && categoriesById[product.categoryId];
    return product && (!cat || !excluded.has(cat.slug));
  });
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
