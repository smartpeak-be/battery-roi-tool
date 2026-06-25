import { totalProductPrice } from './product-pricing.js';

export const SERVICE_CATEGORY_SLUG = 'service';
export const MATERIAL_CATEGORY_SLUG = 'materiaal';
export const MISC_CATEGORY_SLUG = 'diversen';
export const BATTERY_CATEGORY_SLUGS = new Set(['batterijen', 'thuisbatterij-systemen']);
export const INVERTER_CATEGORY_SLUG = 'omvormers';
export const PRODUCT_CONFIG_CUSTOMER_TYPES = new Set(['b2c', 'b2b']);
export const DEFAULT_PRODUCT_CONFIG_CUSTOMER_TYPE = 'b2c';

export function normalizeProductConfigCustomerType(value, config = {}) {
  const raw = String(value || '').trim().toLowerCase();
  if (PRODUCT_CONFIG_CUSTOMER_TYPES.has(raw)) return raw;

  const searchable = [config.name, config.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(^|[^a-z0-9])b2b([^a-z0-9]|$)/i.test(searchable)
    ? 'b2b'
    : DEFAULT_PRODUCT_CONFIG_CUSTOMER_TYPE;
}

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

export function quoteGroupSubtotalExVat(group, productsById) {
  const gross = configSubtotalExVat(group && group.items, productsById)
    + Math.max(0, Number(group && group.extraExVat) || 0);
  return Math.max(0, gross - Math.max(0, Number(group && group.discountExVat) || 0));
}

export function productPurchaseCostExVat(product, qty = 1) {
  const count = Math.max(0, qty || 0);
  const explicitCost = Number(product?.specs?.purchaseCostExVat);
  if (Number.isFinite(explicitCost) && explicitCost > 0) return explicitCost * count;
  return Math.max(0, Number(product?.purchasePrice) || 0) * count;
}

export function quoteGroupsProfitExVat(groups, productsById) {
  return (groups || []).reduce((sum, group) => {
    const productProfit = normalizeConfigItems(group && group.items).reduce((itemSum, item) => {
      const product = productsById && productsById[item.productId];
      if (!product) return itemSum;
      const revenue = totalProductPrice(product, item.qty);
      const cost = productPurchaseCostExVat(product, item.qty);
      return itemSum + Math.max(0, revenue - cost);
    }, 0);
    return sum + productProfit
      + Math.max(0, Number(group && group.extraExVat) || 0)
      - Math.max(0, Number(group && group.discountExVat) || 0);
  }, 0);
}

export function addAmountsToVatGroups(groups, amounts, fallbackDescription = '') {
  const result = (groups || []).map(group => ({
    ...group,
    items: normalizeConfigItems(group.items),
    extraExVat: Math.max(0, Number(group.extraExVat) || 0),
  }));

  (amounts || []).forEach(amount => {
    const exVat = Math.max(0, Number(amount && amount.exVat) || 0);
    if (exVat <= 0) return;
    const vat = Number(amount.vat) || 21;
    let group = result.find(g => Number(g.vat) === vat);
    if (!group) {
      group = {
        vat,
        items: [],
        description: amount.description || fallbackDescription,
        extraExVat: 0,
      };
      result.push(group);
    }
    group.extraExVat = Math.max(0, Number(group.extraExVat) || 0) + exVat;
  });

  return result.filter(group => group.items.length || group.extraExVat > 0);
}

export function applyDiscountToVatGroups(groups, discount, productsById) {
  const result = (groups || []).map(group => ({
    ...group,
    items: normalizeConfigItems(group.items),
    extraExVat: Math.max(0, Number(group.extraExVat) || 0),
    discountExVat: 0,
  }));
  const grossAmounts = result.map(group => (
    configSubtotalExVat(group.items, productsById) + Math.max(0, Number(group.extraExVat) || 0)
  ));
  const grossTotal = grossAmounts.reduce((sum, amount) => sum + amount, 0);
  if (grossTotal <= 0) return result;

  const type = discount && discount.type === 'fixed' ? 'fixed' : 'percent';
  const value = Math.max(0, Number(discount && discount.value) || 0);
  const requested = type === 'fixed' ? value : grossTotal * (value / 100);
  const totalDiscount = Math.min(grossTotal, requested);
  if (totalDiscount <= 0) return result;

  let assigned = 0;
  result.forEach((group, idx) => {
    const isLast = idx === result.length - 1;
    const share = isLast ? (totalDiscount - assigned) : totalDiscount * (grossAmounts[idx] / grossTotal);
    const clamped = Math.min(grossAmounts[idx], Math.max(0, share));
    group.discountExVat = clamped;
    assigned += clamped;
  });
  return result;
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
