const PRODUCT_CONFIG_TYPE_PREFIX = 'PC_';

export function isProductConfigType(type) {
  return typeof type === 'string' && type.startsWith(PRODUCT_CONFIG_TYPE_PREFIX);
}

export function productConfigIdFromType(type) {
  return isProductConfigType(type) ? type.slice(PRODUCT_CONFIG_TYPE_PREFIX.length) : '';
}

function normalizeVat(value, fallback = 21) {
  const n = Number(value);
  return n === 6 || n === 21 ? n : fallback;
}

function normalizeQty(value) {
  return Math.max(1, parseInt(value, 10) || 1);
}

function findCalculatedConfig(project, configType) {
  const results = project?.lastCalcRun?.results;
  const configResults = Array.isArray(results?.configResults) ? results.configResults : [];
  return configResults.find(cr => cr?.cfg?.type === configType)?.cfg || null;
}

function fallbackCompositionLines(project, configType) {
  const linesByType = project?.lastCalcRun?.inputs?.compositionLines;
  const lines = linesByType && linesByType[configType];
  return Array.isArray(lines) ? lines : [];
}

function normalizeManualQuoteLine(line) {
  return {
    kind: 'line',
    description: String(line?.description || ''),
    priceExVat: Math.abs(Number(line?.amountExVat) || 0),
    vat: normalizeVat(line?.vat),
  };
}

function normalizeProductQuoteLine(line) {
  return {
    productId: String(line?.productId || ''),
    qty: normalizeQty(line?.qty),
    vat: normalizeVat(line?.vat),
  };
}

function calculatedQuoteLine(cfg, vat) {
  const amountInclVat = Number(cfg?.price);
  if (!Number.isFinite(amountInclVat) || amountInclVat <= 0) return null;
  const description = String(cfg?.omschrijving || cfg?.description || cfg?.name || '').trim();
  return {
    description: description || 'SmartPeak configuratie',
    amountInclVat: Number(amountInclVat.toFixed(2)),
    vat,
  };
}

export function buildQuoteContextFromProjectConfig(project, configType, opts = {}) {
  const type = String(configType || '');
  const cfg = findCalculatedConfig(project, type) || {};
  const rawLines = Array.isArray(cfg.compositionLines) && cfg.compositionLines.length
    ? cfg.compositionLines
    : fallbackCompositionLines(project, type);
  const adjustableLines = rawLines.filter(line => line && line.automatic !== true && line.kind !== 'inspection');
  const extraProducts = adjustableLines
    .filter(line => line.kind === 'product' && line.productId)
    .map(normalizeProductQuoteLine)
    .filter(line => line.productId);
  const manualLines = adjustableLines
    .filter(line => line.kind === 'manual')
    .map(normalizeManualQuoteLine)
    .filter(line => line.description || line.priceExVat > 0);
  const discountValue = adjustableLines
    .filter(line => line.kind === 'discount')
    .reduce((sum, line) => sum + Math.abs(Number(line.amountExVat) || 0), 0);
  const configId = cfg.productConfigId || productConfigIdFromType(type) || cfg.composition?.baseProductConfigId || '';
  const vat = normalizeVat(opts.vat);

  return {
    projectId: project?.id || '',
    configType: type,
    configId,
    vat,
    calculatedLine: calculatedQuoteLine(cfg, vat),
    extraProducts,
    manualLines,
    discount: { type: 'fixed', value: Number(discountValue.toFixed(2)) },
  };
}

function toBase64Unicode(value) {
  const json = JSON.stringify(value || {});
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(unescape(encodeURIComponent(json)));
  }
  return globalThis.Buffer.from(json, 'utf8').toString('base64');
}

function fromBase64Unicode(value) {
  if (!value) return {};
  if (typeof globalThis.atob === 'function') {
    return JSON.parse(decodeURIComponent(escape(globalThis.atob(value))));
  }
  return JSON.parse(globalThis.Buffer.from(value, 'base64').toString('utf8'));
}

export function encodeQuoteContext(context) {
  return toBase64Unicode(context).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeQuoteContext(encoded) {
  const normalized = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return fromBase64Unicode(padded);
}

export function buildQuoteContextUrl(context, baseUrl = 'producten-beheer.html') {
  const UrlCtor = globalThis.URL;
  const baseHref = globalThis.window?.location?.href || 'https://smartpeak.local/';
  const url = new UrlCtor(baseUrl, baseHref);
  url.searchParams.set('quote', '1');
  url.searchParams.set('ctx', encodeQuoteContext(context));
  return url.pathname.replace(/^\//, '') + url.search + url.hash;
}

export function quoteContextFromSearchParams(searchParams) {
  const SearchParamsCtor = globalThis.URLSearchParams;
  const params = searchParams instanceof SearchParamsCtor ? searchParams : new SearchParamsCtor(searchParams || '');
  if (params.get('ctx')) return decodeQuoteContext(params.get('ctx'));
  if (params.get('quote') !== '1') return null;
  return {
    projectId: params.get('projectId') || '',
    configId: params.get('configId') || productConfigIdFromType(params.get('configType') || ''),
    configType: params.get('configType') || '',
    vat: normalizeVat(params.get('vat')),
    extraProducts: [],
    manualLines: [],
    discount: { type: 'fixed', value: 0 },
  };
}

if (typeof globalThis.window !== 'undefined') {
  globalThis.window.SmartPeakQuoteContext = {
    buildQuoteContextFromProjectConfig,
    buildQuoteContextUrl,
    decodeQuoteContext,
    encodeQuoteContext,
    isProductConfigType,
    productConfigIdFromType,
    quoteContextFromSearchParams,
  };
}
