import { totalProductPrice } from './product-pricing.js';
import {
  bebatTotalInclVat,
  categoryMap,
  configBatteryWeightKg,
} from './product-configs.js';

const INSPECTION_LINE_ID = 'auto-inspection';

function productLookup(products) {
  return Object.fromEntries((products || []).map(p => [p.id, p]));
}

function normalizeVat(vat, fallback = 21) {
  const n = Number(vat);
  return n === 6 || n === 21 ? n : fallback;
}

function normalizeQty(qty) {
  return Math.max(1, parseInt(qty, 10) || 1);
}

function lineAmountExVat(line, productsById) {
  if (!line) return 0;
  if (line.kind === 'product' || line.kind === 'inspection') {
    const product = productsById[line.productId];
    if (!product) return Number(line.amountExVat) || 0;
    return totalProductPrice(product, normalizeQty(line.qty));
  }
  return Number(line.amountExVat) || 0;
}

function lineDescription(line, productsById) {
  if (!line) return '';
  if ((line.kind === 'product' || line.kind === 'inspection') && line.productId) {
    const product = productsById[line.productId];
    if (product) return [product.brand, product.model].filter(Boolean).join(' ').trim()
      || product.description
      || product.model
      || line.description
      || line.productId;
  }
  return line.description || '';
}

function compositionProductItems(lines) {
  return (lines || [])
    .filter(line => line && line.kind === 'product' && line.productId)
    .map(line => ({ productId: String(line.productId), qty: normalizeQty(line.qty) }));
}

function bebatLineFor(baseConfig, resolvedLines, productsById, categoriesById, bebatPricePerKg) {
  const pricePerKg = Number(bebatPricePerKg);
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) return null;
  const items = [
    ...(Array.isArray(baseConfig?.items) ? baseConfig.items : []),
    ...compositionProductItems(resolvedLines),
  ];
  const kg = configBatteryWeightKg(items, productsById, categoriesById);
  const amountInclBtw = bebatTotalInclVat(kg, pricePerKg);
  if (!(amountInclBtw > 0)) return null;
  return {
    id: 'auto-bebat',
    kind: 'bebat',
    description: `Bebat bijdrage (${kg.toFixed(2)} kg x EUR ${pricePerKg.toFixed(2)}/kg)`,
    amountExVat: amountInclBtw / 1.21,
    amountInclBtw,
    vat: 21,
    automatic: true,
  };
}

export function isInspectionProduct(product, inspectionProductId = '') {
  return !!product && (
    (inspectionProductId && product.id === inspectionProductId)
    || product.serviceKey === 'inspection'
    || product?.specs?.serviceKey === 'inspection'
  );
}

export function selectableComposerProducts(products = [], inspectionProductId = '') {
  return (products || []).filter(product => !isInspectionProduct(product, inspectionProductId));
}

export function ensureInspectionLine(lines, inspectionProduct, keuringChoice) {
  const withoutInspection = (lines || []).filter(line => !(line && line.kind === 'inspection'));
  if (keuringChoice !== 'yes' || !inspectionProduct) return withoutInspection;
  return [
    ...withoutInspection,
    {
      id: INSPECTION_LINE_ID,
      kind: 'inspection',
      productId: inspectionProduct.id,
      qty: 1,
      description: inspectionProduct.model || inspectionProduct.description || 'Keuring',
      amountExVat: totalProductPrice(inspectionProduct, 1),
      vat: 21,
      automatic: true,
    },
  ];
}

export function serializeCompositionLines(lines, opts = {}) {
  return (lines || [])
    .filter(line => line && !line.automatic && line.kind !== 'inspection')
    .filter(line => !(line.kind === 'product' && opts.inspectionProductId && line.productId === opts.inspectionProductId))
    .map(line => ({
      id: line.id || `comp_${Math.random().toString(36).slice(2, 10)}`,
      kind: line.kind || 'manual',
      ...(line.productId ? { productId: String(line.productId) } : {}),
      ...(line.qty != null ? { qty: normalizeQty(line.qty) } : {}),
      description: line.description || '',
      amountExVat: Number(line.amountExVat) || 0,
      vat: normalizeVat(line.vat),
    }))
    .filter(line => {
      if (line.kind === 'product') return !!line.productId;
      return line.description.trim() !== '' || line.amountExVat !== 0;
    });
}

export function resolveCompositionToCalculatorConfig(baseConfig, composition, products = [], opts = {}) {
  if (!baseConfig) return null;
  const btwPercent = normalizeVat(opts.btwPercent, 21);
  const productsById = productLookup(products);
  const categoriesById = opts.categoriesById || categoryMap(opts.categories || []);
  const basePrice = Number(baseConfig.prices && baseConfig.prices[`${btwPercent}_no`]);
  const normalizedBasePrice = Number.isFinite(basePrice) ? basePrice : Number(baseConfig.basePrice || baseConfig.price || 0);
  const resolvedLines = (composition && composition.lines ? composition.lines : []).map(line => {
    const amountExVat = lineAmountExVat(line, productsById);
    const vat = normalizeVat(line.vat, line.kind === 'inspection' ? 21 : btwPercent);
    return {
      id: line.id || `comp_${Math.random().toString(36).slice(2, 10)}`,
      kind: line.kind || 'manual',
      ...(line.productId ? { productId: String(line.productId) } : {}),
      ...(line.qty != null ? { qty: normalizeQty(line.qty) } : {}),
      description: lineDescription(line, productsById),
      amountExVat,
      amountInclBtw: amountExVat * (1 + vat / 100),
      vat,
      automatic: line.automatic === true,
    };
  });
  const bebatLine = bebatLineFor(baseConfig, resolvedLines, productsById, categoriesById, opts.bebatPricePerKg);
  const allLines = bebatLine ? [...resolvedLines, bebatLine] : resolvedLines;
  const compositionTotalInclBtw = allLines.reduce((sum, line) => sum + line.amountInclBtw, 0);

  return {
    type: baseConfig.type,
    omschrijving: baseConfig.omschrijving,
    batCap: baseConfig.batCap,
    batInv: baseConfig.batInv,
    eff: baseConfig.eff,
    basePrice: normalizedBasePrice,
    price: normalizedBasePrice + compositionTotalInclBtw,
    source: baseConfig.source,
    productConfigId: baseConfig.productConfigId,
    productConfigName: baseConfig.productConfigName,
    items: baseConfig.items,
    compositionTotalInclBtw,
    compositionLines: allLines,
    composition: {
      type: baseConfig.type,
      baseProductConfigId: baseConfig.productConfigId || (composition && composition.baseProductConfigId) || '',
      lines: allLines,
    },
  };
}
