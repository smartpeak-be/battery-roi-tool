import {
  BATTERY_CATEGORY_SLUGS,
  INVERTER_CATEGORY_SLUG,
  categoryMap,
  configSubtotalExVat,
  generatedConfigDescription,
  normalizeProductConfigCustomerType,
  productConfigCalculationReadiness,
  productMap,
} from './product-configs.js';

const DEFAULT_EFFICIENCY = 0.90;
const PRODUCT_CONFIG_TYPE_PREFIX = 'PC_';

function normalizeQty(qty) {
  return Math.max(0, parseInt(qty, 10) || 0);
}

function isBatteryOrSystem(product, categoriesById) {
  const cat = product && categoriesById && categoriesById[product.categoryId];
  return !!(cat && BATTERY_CATEGORY_SLUGS.has(cat.slug));
}

function isInverter(product, categoriesById) {
  const cat = product && categoriesById && categoriesById[product.categoryId];
  return !!(cat && cat.slug === INVERTER_CATEGORY_SLUG);
}

function normalizeEfficiency(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1 ? n / 100 : n;
}

function productCapacityKwh(product) {
  const n = Number(product?.specs?.capacityKwh);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function productInverterPowerKw(product) {
  const n = Number(product?.specs?.inverterPowerKw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function productEfficiency(product) {
  return normalizeEfficiency(product?.specs?.efficiency)
    || normalizeEfficiency(product?.specs?.eff)
    || null;
}

function inferTechnicalSpecs(items, productsById, categoriesById) {
  let batCap = 0;
  let batInv = 0;
  let weightedEffTotal = 0;
  let effWeightTotal = 0;

  (items || []).forEach(item => {
    const product = productsById[item.productId];
    if (!product) return;

    const isBat = isBatteryOrSystem(product, categoriesById);
    const isInv = isInverter(product, categoriesById);
    if (!isBat && !isInv) return;

    const qty = normalizeQty(item.qty);
    const inv = productInverterPowerKw(product) * qty;
    const eff = productEfficiency(product);

    if (isBat) {
      const cap = productCapacityKwh(product) * qty;
      batCap += cap;
      batInv += inv;
      if (eff) {
        const weight = cap > 0 ? cap : qty;
        weightedEffTotal += eff * weight;
        effWeightTotal += weight;
      }
    }

    if (isInv) {
      batInv += inv;
      if (eff) {
        weightedEffTotal += eff * qty;
        effWeightTotal += qty;
      }
    }
  });

  return {
    batCap,
    batInv,
    eff: effWeightTotal > 0 ? weightedEffTotal / effWeightTotal : DEFAULT_EFFICIENCY,
  };
}

export function productConfigType(id) {
  return `${PRODUCT_CONFIG_TYPE_PREFIX}${id}`;
}

export function isProductConfigType(type) {
  return typeof type === 'string' && type.startsWith(PRODUCT_CONFIG_TYPE_PREFIX);
}

export function productConfigIdFromType(type) {
  return isProductConfigType(type) ? type.slice(PRODUCT_CONFIG_TYPE_PREFIX.length) : '';
}

export function productConfigToCalcConfig(config, products, categories, options = {}) {
  if (!config || config.isActive === false) return null;

  const customerType = normalizeProductConfigCustomerType(config.customerType, config);
  const includeCustomerTypes = options.includeCustomerTypes || ['b2c'];
  if (!includeCustomerTypes.includes('all') && !includeCustomerTypes.includes(customerType)) return null;

  const productsById = productMap(products || []);
  const categoriesById = categoryMap(categories || []);
  const readiness = productConfigCalculationReadiness(config, productsById, categoriesById, options);
  if (!readiness.eligible) return null;
  const items = (config.items || [])
    .map(item => ({ productId: item?.productId ? String(item.productId) : '', qty: normalizeQty(item?.qty) }))
    .filter(item => item.productId && item.qty > 0 && productsById[item.productId]);

  const { batCap, batInv, eff } = inferTechnicalSpecs(items, productsById, categoriesById);
  if (!(batCap > 0) || !(batInv > 0) || !(eff > 0)) return null;

  const subtotalExVat = configSubtotalExVat(items, productsById);
  const type = productConfigType(config.id);
  const omschrijving = generatedConfigDescription(items, productsById, categoriesById)
    || config.description
    || config.name
    || type;

  return {
    type,
    omschrijving,
    batCap,
    batInv,
    eff,
    prices: {
      '6_no': subtotalExVat * 1.06,
      '6_yes': subtotalExVat * 1.06,
      '21_no': subtotalExVat * 1.21,
      '21_yes': subtotalExVat * 1.21,
    },
    source: 'productConfig',
    customerType,
    productConfigId: config.id,
    productConfigName: config.name || '',
    items,
  };
}

export function productConfigsToCalcConfigs(configs, products, categories, options = {}) {
  return (configs || [])
    .map(config => productConfigToCalcConfig(config, products, categories, options))
    .filter(Boolean);
}
