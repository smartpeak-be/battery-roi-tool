/* global window, document, bootstrap, firebase, fetch, atob, Blob, File, URL, setTimeout */

import {
  bebatTotalInclVat,
  categoryMap,
  configBatteryWeightKg,
  configItemsExceptCategorySlugs,
  configItemsForCategorySlug,
  generatedConfigDescription,
  addAmountsToVatGroups,
  applyDiscountToVatGroups,
  MATERIAL_CATEGORY_SLUG,
  MISC_CATEGORY_SLUG,
  productLabel,
  productMap,
  quoteGroupsProfitExVat,
  quoteGroupSubtotalExVat,
} from './product-configs.js';
import { escapeHtml } from './shared-helpers.js';
import { normalizeBillitEmail, normalizeBillitPhone } from './billit-helpers.js';

const QUOTE_MODAL_HTML = `
  <div class="modal fade" id="quoteModal" tabindex="-1" aria-labelledby="quoteModalTitle" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="quoteModalTitle"><i class="fa-solid fa-file-invoice-dollar me-2" aria-hidden="true"></i>Offerte-preview</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
        </div>
        <div class="modal-body" id="quoteModalBody"></div>
        <div class="modal-footer">
          <span class="text-muted small me-auto">Billit-integratie maakt voorlopig een concept-offerte in sandbox.</span>
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Sluiten</button>
        </div>
      </div>
    </div>
  </div>
`;

let _categories = [];
let _settings = {};
let _allProducts = [];
let _allConfigs = [];
let _quoteProjects = [];
let _onBillitPdfAttached = null;
let _currentContext = {};

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message, variant = 'primary') {
  if (typeof window.showToast === 'function') return window.showToast(message, variant);
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const id = 'toast-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`);
  const toastEl = document.getElementById(id);
  bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 }).show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function ensureQuoteModal() {
  if (document.getElementById('quoteModal')) return;
  document.body.insertAdjacentHTML('beforeend', QUOTE_MODAL_HTML);
}

function categoryColor(slugOrCategory) {
  const slug = typeof slugOrCategory === 'string'
    ? slugOrCategory
    : (slugOrCategory && (slugOrCategory.slug || slugOrCategory.name) || '');
  const normalized = String(slug || '').toLowerCase();
  if (normalized === 'service') return '#16a34a';
  if (normalized === 'materiaal') return '#f59e0b';
  if (normalized === 'diversen') return '#8b5cf6';
  if (normalized.includes('batterij') || normalized.includes('thuisbatterij')) return '#dc2626';
  if (normalized.includes('omvormer')) return '#2563eb';
  return '#64748b';
}

function _maps() {
  return {
    productsById: productMap(_allProducts),
    categoriesById: categoryMap(_categories),
  };
}

function activeConfigProducts() {
  return _allProducts.filter(p => p.isActive !== false);
}

function productOptionsHtml(selectedId) {
  const categoriesById = categoryMap(_categories);
  return '<option value="">— Product kiezen —</option>' + activeConfigProducts().map(p => (
    `<option value="${escapeAttr(p.id)}" style="color:${escapeAttr(categoryColor(categoriesById[p.categoryId]))}" ${p.id === selectedId ? 'selected' : ''}>● ${escapeHtml(productLabel(p, categoriesById))}</option>`
  )).join('');
}

async function loadQuoteData(context = {}) {
  const loaders = [
    window.listProductCategories(),
    window.listProducts(),
    window.listProductConfigs(),
    window.getSettings ? window.getSettings() : Promise.resolve({}),
    window.listActiveProjects ? window.listActiveProjects() : Promise.resolve([]),
  ];
  const [categories, products, configs, settings, projects] = await Promise.all(loaders);
  _categories = categories || [];
  _allProducts = products || [];
  _allConfigs = configs || [];
  _settings = settings || {};
  _quoteProjects = projects || [];
  if (context.configType && !context.configId && String(context.configType).startsWith('CUSTOM_')) {
    const customName = String(context.customConfigName || context.calculatedLine?.description || 'Samenstelling uit calculator').trim();
    if (!_allConfigs.some(c => c.id === context.configType)) {
      _allConfigs.unshift({
        id: context.configType,
        name: customName || 'Samenstelling uit calculator',
        isActive: true,
        items: [],
      });
    }
  }
  if (context.project && context.project.id && !_quoteProjects.some(p => p.id === context.project.id)) {
    _quoteProjects.unshift(context.project);
  }
}

async function openQuoteModal(context = {}, options = {}) {
  ensureQuoteModal();
  _currentContext = context || {};
  _onBillitPdfAttached = options.onBillitPdfAttached || null;
  const body = document.getElementById('quoteModalBody');
  body.innerHTML = '<p class="text-muted">Laden...</p>';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('quoteModal')).show();
  await loadQuoteData(context);
  body.innerHTML = buildQuoteModalHtml(context);
  wireQuoteModal();
  updateQuotePreview();
}

function buildQuoteModalHtml(context = {}) {
  const selectedVat = Number(context.vat) === 6 ? 6 : 21;
  const hasContextCompositionLines = (Array.isArray(context.extraProducts) && context.extraProducts.length > 0)
    || (Array.isArray(context.manualLines) && context.manualLines.length > 0)
    || Number(context.discount?.value) > 0;
  const useCalculatedLine = Boolean(context.calculatedLine?.amountInclVat) && !hasContextCompositionLines;
  const discount = useCalculatedLine ? {} : (context.discount || {});
  const discountType = discount.type === 'percent' ? 'percent' : 'fixed';
  const discountValue = Number(discount.value) > 0 ? Number(discount.value) : '';
  const sourceExtraProducts = useCalculatedLine ? [] : (Array.isArray(context.extraProducts) ? context.extraProducts : []);
  const sourceManualLines = useCalculatedLine ? [] : (Array.isArray(context.manualLines) ? context.manualLines : []);
  const extraProductRows = sourceExtraProducts
    .map(row => quoteExtraProductRowHtml({ ...row, vat: row.vat || selectedVat }))
    .join('');
  const manualRows = sourceManualLines
    .map(row => quoteManualLineRowHtml({ ...row, vat: row.vat || selectedVat }))
    .join('');
  const selectedConfigId = context.configId || (String(context.configType || '').startsWith('CUSTOM_') ? context.configType : '');
  const configOptions = _allConfigs.filter(c => c.isActive !== false).map(c => (
    `<option value="${escapeAttr(c.id)}" ${selectedConfigId === c.id ? 'selected' : ''}>${escapeHtml(c.name || '(zonder naam)')}</option>`
  )).join('');
  const projectOptions = (_quoteProjects || []).map(p => (
    `<option value="${escapeAttr(p.id)}" ${context.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.projectName || p.customerName || '(zonder naam)')}</option>`
  )).join('');
  return `
    <div class="row g-3">
      <input type="hidden" id="quoteConfigType" value="${escapeAttr(context.configType || '')}">
      <div class="col-md-6">
        <label class="form-label">Klant/project</label>
        <select class="form-select" id="quoteProject"><option value="">— Nog geen klantcontext —</option>${projectOptions}</select>
      </div>
      <div class="col-md-6">
        <label class="form-label">Configuratie</label>
        <select class="form-select" id="quoteConfig"><option value="">— Kies configuratie —</option>${configOptions}</select>
      </div>
      <div class="col-md-4">
        <label class="form-label">BTW config/services</label>
        <select class="form-select" id="quoteVat"><option value="6" ${selectedVat === 6 ? 'selected' : ''}>6% woning 10+ jaar</option><option value="21" ${selectedVat === 21 ? 'selected' : ''}>21%</option></select>
      </div>
      <div class="col-md-4">
        <label class="form-label">Korting op samenstelling</label>
        <div class="input-group">
          <select class="form-select" id="quoteDiscountType" style="max-width:110px" ${useCalculatedLine ? 'disabled' : ''}>
            <option value="percent" ${discountType === 'percent' ? 'selected' : ''}>%</option>
            <option value="fixed" ${discountType === 'fixed' ? 'selected' : ''}>€</option>
          </select>
          <input type="number" class="form-control" id="quoteDiscountValue" min="0" step="0.01" value="${escapeAttr(discountValue)}" placeholder="Geen" ${useCalculatedLine ? 'disabled' : ''}>
        </div>
      </div>
      ${useCalculatedLine ? '<div class="col-12"><div class="alert alert-info py-2 mb-0">Prijs en omschrijving komen exact uit de laatst bewaarde calculatorberekening. Extra lijnen uit de composer zijn daarin al verwerkt.</div></div>' : ''}
      <div class="col-12">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="mb-0">Extra producten</h6>
          <button type="button" class="btn btn-sm btn-outline-primary" id="btnAddQuoteProduct">
            <i class="fa-solid fa-plus me-1"></i>Productlijn toevoegen
          </button>
        </div>
        <div id="quoteExtraProducts">${extraProductRows}</div>
      </div>
      <div class="col-12">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="mb-0">Manuele lijnen</h6>
          <button type="button" class="btn btn-sm btn-outline-primary" id="btnAddQuoteManualLine">
            <i class="fa-solid fa-plus me-1"></i>Manuele lijn toevoegen
          </button>
        </div>
        <div id="quoteManualLines">${manualRows}</div>
      </div>
      <div class="col-12">
        <div id="quotePreview" class="border rounded p-3 bg-light"></div>
      </div>
    </div>`;
}

function wireQuoteModal() {
  ['quoteProject', 'quoteConfig', 'quoteVat', 'quoteDiscountType', 'quoteDiscountValue'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateQuotePreview);
    document.getElementById(id)?.addEventListener('input', updateQuotePreview);
  });
  document.getElementById('btnAddQuoteProduct')?.addEventListener('click', () => {
    const vat = parseFloat(document.getElementById('quoteVat')?.value) || 21;
    document.getElementById('quoteExtraProducts').insertAdjacentHTML('beforeend', quoteExtraProductRowHtml({ vat }));
    wireQuoteDynamicRows();
    updateQuotePreview();
  });
  document.getElementById('btnAddQuoteManualLine')?.addEventListener('click', () => {
    const vat = parseFloat(document.getElementById('quoteVat')?.value) || 21;
    document.getElementById('quoteManualLines').insertAdjacentHTML('beforeend', quoteManualLineRowHtml({ vat }));
    wireQuoteDynamicRows();
    updateQuotePreview();
  });
  document.getElementById('btnCreateBillitOffer')?.addEventListener('click', createBillitOfferFromPreview);
  wireQuoteDynamicRows();
}

function quoteExtraProductRowHtml(row = {}) {
  return `
    <div class="row g-2 align-items-end mb-2 quote-extra-product-row">
      <div class="col-md-7">
        <label class="form-label small mb-1">Product</label>
        <select class="form-select quote-extra-product-id">${productOptionsHtml(row.productId || '')}</select>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">Aantal</label>
        <input type="number" class="form-control quote-extra-product-qty" min="1" step="1" value="${escapeAttr(row.qty || 1)}">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">BTW</label>
        <select class="form-select quote-extra-product-vat">
          <option value="6" ${row.vat === 6 ? 'selected' : ''}>6%</option>
          <option value="21" ${row.vat === 21 || row.vat == null ? 'selected' : ''}>21%</option>
        </select>
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-outline-danger w-100 quote-row-remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function quoteManualLineRowHtml(row = {}) {
  const kind = row.kind || 'line';
  return `
    <div class="row g-2 align-items-end mb-2 quote-manual-line-row">
      <div class="col-md-3">
        <label class="form-label small mb-1">Type</label>
        <select class="form-select quote-manual-kind">
          <option value="line" ${kind === 'line' ? 'selected' : ''}>Aparte lijn</option>
          <option value="installation_extra" ${kind === 'installation_extra' ? 'selected' : ''}>Extra installatiekost</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label small mb-1">Omschrijving</label>
        <input type="text" class="form-control quote-manual-desc" value="${escapeAttr(row.description || '')}" placeholder="Omschrijving">
      </div>
      <div class="col-md-3">
        <label class="form-label small mb-1">Prijs ex BTW</label>
        <div class="input-group">
          <span class="input-group-text">€</span>
          <input type="number" class="form-control quote-manual-price" min="0" step="0.01" value="${escapeAttr(row.priceExVat ?? '')}">
        </div>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">BTW</label>
        <select class="form-select quote-manual-vat">
          <option value="6" ${row.vat === 6 ? 'selected' : ''}>6%</option>
          <option value="21" ${row.vat === 21 || row.vat == null ? 'selected' : ''}>21%</option>
        </select>
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-outline-danger w-100 quote-row-remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function wireQuoteDynamicRows() {
  document.querySelectorAll('#quoteModalBody .quote-row-remove').forEach(btn => {
    btn.onclick = () => {
      btn.closest('.quote-extra-product-row, .quote-manual-line-row').remove();
      updateQuotePreview();
    };
  });
  document.querySelectorAll('#quoteExtraProducts select, #quoteExtraProducts input, #quoteManualLines input, #quoteManualLines select').forEach(el => {
    el.oninput = updateQuotePreview;
    el.onchange = updateQuotePreview;
  });
}

function readQuoteExtraProductItems() {
  const { productsById } = _maps();
  return Array.from(document.querySelectorAll('#quoteExtraProducts .quote-extra-product-row')).map(row => {
    const productId = row.querySelector('.quote-extra-product-id').value;
    const product = productsById[productId];
    const qty = parseInt(row.querySelector('.quote-extra-product-qty').value, 10) || 0;
    const vat = parseFloat(row.querySelector('.quote-extra-product-vat').value) || 21;
    if (!product || qty <= 0) return null;
    return { productId, qty, vat };
  }).filter(Boolean);
}

function readQuoteManualLines() {
  return Array.from(document.querySelectorAll('#quoteManualLines .quote-manual-line-row')).map(row => {
    const kind = row.querySelector('.quote-manual-kind').value || 'line';
    const description = row.querySelector('.quote-manual-desc').value.trim();
    const exVat = parseFloat(row.querySelector('.quote-manual-price').value) || 0;
    const vat = parseFloat(row.querySelector('.quote-manual-vat').value) || 21;
    if (exVat <= 0) return null;
    if (kind === 'line' && !description) return null;
    return { kind, description: description || 'Extra installatiekost', exVat, vat };
  }).filter(Boolean);
}

function readQuoteDiscount() {
  return {
    type: document.getElementById('quoteDiscountType')?.value === 'fixed' ? 'fixed' : 'percent',
    value: parseFloat(document.getElementById('quoteDiscountValue')?.value) || 0,
  };
}

function quoteLineHtml(line) {
  const incl = line.exVat * (1 + line.vat / 100);
  const colorStyle = line.color ? ` style="border-left:4px solid ${escapeAttr(line.color)}"` : '';
  return `
          <tr>
            <td${colorStyle}>${escapeHtml(line.description)}</td>
            <td class="text-end">€${line.exVat.toFixed(2)}</td>
            <td class="text-end">${line.vat}%</td>
            <td class="text-end">€${incl.toFixed(2)}</td>
          </tr>`;
}

function mergeConfigItems(items) {
  const byProduct = new Map();
  (items || []).forEach(item => {
    if (!item.productId || !item.qty) return;
    byProduct.set(item.productId, (byProduct.get(item.productId) || 0) + item.qty);
  });
  return Array.from(byProduct, ([productId, qty]) => ({ productId, qty }));
}

function categoryItemsByVat(baseItems, extraItems, productsById, categoriesById, categorySlug, quoteVat) {
  const groups = new Map();
  const isMatch = (item) => {
    if (!categorySlug) {
      return configItemsExceptCategorySlugs([item], productsById, categoriesById, [MATERIAL_CATEGORY_SLUG, MISC_CATEGORY_SLUG]).length > 0;
    }
    return configItemsForCategorySlug([item], productsById, categoriesById, categorySlug).length > 0;
  };

  const push = (vat, item) => {
    if (!isMatch(item)) return;
    const key = String(vat);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ productId: item.productId, qty: item.qty });
  };

  (baseItems || []).forEach(item => push(quoteVat, item));
  (extraItems || []).forEach(item => push(item.vat, item));
  return Array.from(groups, ([vat, items]) => ({
    vat: Number(vat),
    items: mergeConfigItems(items),
  })).filter(group => group.items.length);
}

function quoteGroupColor(group, productsById, categoriesById, fallbackSlug) {
  if (fallbackSlug) return categoryColor(fallbackSlug);
  if ((!group.items || group.items.length === 0) && Number(group.extraExVat) > 0) return categoryColor('service');
  const slugs = new Set((group.items || []).map(item => {
    const product = productsById[item.productId];
    const cat = product && categoriesById[product.categoryId];
    return cat && cat.slug;
  }).filter(Boolean));
  if (slugs.size === 1) return categoryColor([...slugs][0]);
  if (slugs.has('service') && slugs.size === 1) return categoryColor('service');
  return categoryColor('thuisbatterij-systemen');
}

function quoteGroupedLineModels(groups, productsById, categoriesById, prefix = '') {
  return groups.map(group => {
    const exVat = quoteGroupSubtotalExVat(group, productsById);
    const description = generatedConfigDescription(group.items, productsById, categoriesById)
      || group.description
      || 'Extra installatiekost';
    const discountSuffix = Number(group.discountExVat) > 0 ? ` (korting €${Number(group.discountExVat).toFixed(2)})` : '';
    const fallbackSlug = prefix.startsWith('Materiaal') ? MATERIAL_CATEGORY_SLUG
      : (prefix.startsWith('Diversen') ? MISC_CATEGORY_SLUG : '');
    return {
      description: `${prefix}${description}${discountSuffix}`,
      exVat,
      vat: group.vat,
      color: quoteGroupColor(group, productsById, categoriesById, fallbackSlug),
    };
  });
}

function quoteGroupedRowsHtml(groups, productsById, categoriesById, prefix = '') {
  return quoteGroupedLineModels(groups, productsById, categoriesById, prefix).map(quoteLineHtml).join('');
}

function groupedQuoteIncl(groups, productsById) {
  return groups.reduce((sum, group) => {
    const exVat = quoteGroupSubtotalExVat(group, productsById);
    return sum + exVat * (1 + group.vat / 100);
  }, 0);
}

function currentBebatPricePerKg() {
  const fromInput = parseFloat(document.getElementById('settingsBebatPerKg')?.value);
  if (!isNaN(fromInput) && fromInput > 0) return fromInput;
  const fromSettings = parseFloat(_settings.bebatPricePerKg);
  if (!isNaN(fromSettings) && fromSettings > 0) return fromSettings;
  return 2.89;
}

function calculatedLineFromContext(vat) {
  if (!_currentContext?.calculatedLine) return null;
  const amountInclVat = Number(_currentContext.calculatedLine.amountInclVat);
  if (!Number.isFinite(amountInclVat) || amountInclVat <= 0) return null;
  const description = String(_currentContext.calculatedLine.description || '').trim() || 'SmartPeak configuratie';
  return {
    description,
    exVat: amountInclVat / (1 + vat / 100),
    vat,
    color: categoryColor('thuisbatterij-systemen'),
  };
}

function buildQuoteComputation() {
  const cfg = _allConfigs.find(c => c.id === document.getElementById('quoteConfig')?.value);
  if (!cfg) return null;
  const { productsById, categoriesById } = _maps();
  const vat = parseFloat(document.getElementById('quoteVat').value) || 21;
  const calculatedLine = calculatedLineFromContext(vat);
  const project = _quoteProjects.find(p => p.id === document.getElementById('quoteProject')?.value) || null;
  if (calculatedLine && cfg.id === _currentContext.configId) {
    const totalIncl = calculatedLine.exVat * (1 + calculatedLine.vat / 100);
    return {
      cfg,
      project,
      lines: [calculatedLine],
      mainRows: quoteLineHtml(calculatedLine),
      materialRows: '',
      miscRows: '',
      extraRows: '',
      kg: 0,
      bebatPrice: 0,
      bebatIncl: 0,
      totalProfit: 0,
      totalIncl,
      discountExVat: 0,
      fromCalculatedLine: true,
    };
  }
  const extraProductItems = readQuoteExtraProductItems();
  const manualLines = readQuoteManualLines();
  const installationExtras = manualLines.filter(line => line.kind === 'installation_extra');
  const extraLines = manualLines.filter(line => line.kind !== 'installation_extra');
  const undiscountedMainGroups = addAmountsToVatGroups(
    categoryItemsByVat(cfg.items, extraProductItems, productsById, categoriesById, null, vat),
    installationExtras,
    'Extra installatiekost',
  );
  const mainGroups = applyDiscountToVatGroups(undiscountedMainGroups, readQuoteDiscount(), productsById);
  const materialGroups = categoryItemsByVat(cfg.items, extraProductItems, productsById, categoriesById, MATERIAL_CATEGORY_SLUG, vat);
  const miscGroups = categoryItemsByVat(cfg.items, extraProductItems, productsById, categoriesById, MISC_CATEGORY_SLUG, vat);
  const kg = configBatteryWeightKg([...cfg.items, ...extraProductItems], productsById, categoriesById);
  const bebatPrice = currentBebatPricePerKg();
  const bebatIncl = bebatTotalInclVat(kg, bebatPrice);
  const mainRows = mainGroups.length
    ? quoteGroupedRowsHtml(mainGroups, productsById, categoriesById)
    : quoteLineHtml({ description: cfg.name || 'Configuratie', exVat: 0, vat });
  const materialRows = quoteGroupedRowsHtml(materialGroups, productsById, categoriesById, 'Materiaal: ');
  const miscRows = quoteGroupedRowsHtml(miscGroups, productsById, categoriesById, 'Diversen: ');
  const extraRows = extraLines.map(quoteLineHtml).join('');
  const bebatExVat = bebatIncl / 1.21;
  const lines = [
    ...quoteGroupedLineModels(mainGroups, productsById, categoriesById),
    ...quoteGroupedLineModels(materialGroups, productsById, categoriesById, 'Materiaal: '),
    ...quoteGroupedLineModels(miscGroups, productsById, categoriesById, 'Diversen: '),
    ...extraLines,
    {
      description: `Bebat bijdrage (${kg.toFixed(2)} kg x EUR ${bebatPrice.toFixed(2)}/kg)`,
      exVat: bebatExVat,
      vat: 21,
      color: categoryColor('diversen'),
    },
  ].filter(line => Number(line.exVat) > 0);
  const extraIncl = extraLines.reduce((sum, line) => sum + line.exVat * (1 + line.vat / 100), 0);
  const groupedIncl = groupedQuoteIncl(mainGroups, productsById)
    + groupedQuoteIncl(materialGroups, productsById)
    + groupedQuoteIncl(miscGroups, productsById);
  const groupedProfit = quoteGroupsProfitExVat(mainGroups, productsById)
    + quoteGroupsProfitExVat(materialGroups, productsById)
    + quoteGroupsProfitExVat(miscGroups, productsById);
  const manualProfit = extraLines.reduce((sum, line) => sum + line.exVat, 0);
  const totalProfit = groupedProfit + manualProfit;
  const totalIncl = groupedIncl + bebatIncl + extraIncl;
  const discountExVat = mainGroups.reduce((sum, group) => sum + (Number(group.discountExVat) || 0), 0);
  return { cfg, project, lines, mainRows, materialRows, miscRows, extraRows, kg, bebatPrice, bebatIncl, totalProfit, totalIncl, discountExVat };
}

function updateQuotePreview() {
  const el = document.getElementById('quotePreview');
  if (!el) return;
  const computed = buildQuoteComputation();
  if (!computed) {
    el.innerHTML = '<p class="text-muted mb-0">Kies een configuratie om de offerte-lijnen te bekijken.</p>';
    return;
  }
  const { mainRows, materialRows, miscRows, extraRows, kg, bebatPrice, bebatIncl, totalProfit, totalIncl, discountExVat, fromCalculatedLine } = computed;
  el.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <thead><tr><th>Omschrijving</th><th class="text-end">Ex BTW</th><th class="text-end">BTW</th><th class="text-end">Incl.</th></tr></thead>
        <tbody>
          ${mainRows}
          ${materialRows}
          ${miscRows}
          ${extraRows}
          ${fromCalculatedLine ? '' : `<tr>
            <td>Bebat bijdrage (${kg.toFixed(2)} kg × €${bebatPrice.toFixed(2)}/kg)</td>
            <td class="text-end">€${(bebatIncl / 1.21).toFixed(2)}</td>
            <td class="text-end">21%</td>
            <td class="text-end">€${bebatIncl.toFixed(2)}</td>
          </tr>`}
        </tbody>
        <tfoot><tr><th colspan="3" class="text-end">Totaal incl. BTW</th><th class="text-end">€${totalIncl.toFixed(2)}</th></tr></tfoot>
      </table>
    </div>
    ${fromCalculatedLine ? '<div class="alert alert-info py-2 mb-2">Deze offerte gebruikt exact de prijs en omschrijving uit de calculatorberekening.</div>' : `<div class="alert alert-success py-2 mb-2">
      <strong>Totale winst ex BTW:</strong> €${totalProfit.toFixed(2)}
      ${discountExVat > 0 ? `<br><span class="text-muted small">Korting op samenstelling: €${discountExVat.toFixed(2)} ex BTW</span>` : ''}
    </div>`}
    <div class="d-flex flex-wrap align-items-center gap-2">
      <button type="button" class="btn btn-primary" id="btnCreateBillitOffer">
        <i class="fa-solid fa-paper-plane me-1"></i> Maak Billit-offerte
      </button>
      <span class="text-muted small" id="billitOfferStatus">Maakt een concept-offerte in Billit sandbox.</span>
    </div>`;
  const billitBtn = document.getElementById('btnCreateBillitOffer');
  if (billitBtn) billitBtn.onclick = createBillitOfferFromPreview;
}

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function projectBillitCustomer(project) {
  const merged = typeof window.mergeProjectMetadata === 'function' && project ? window.mergeProjectMetadata(project) : project;
  const customer = merged && merged.customer ? merged.customer : {};
  const address = typeof window.billitAddressForCustomer === 'function'
    ? window.billitAddressForCustomer(customer)
    : { street: '', city: '', zipcode: '' };
  return {
    Name: (project && (project.customerName || project.projectName)) || '',
    Street: address.street,
    City: address.city,
    Zipcode: address.zipcode,
    CountryCode: 'BE',
    Email: normalizeBillitEmail(customer.email),
    Phone: normalizeBillitPhone(customer.phone),
  };
}

function buildBillitOfferPayloadForComputed(computed) {
  if (!computed.project) throw new Error('Kies eerst een klant/project voor de Billit-offerte.');
  const customer = projectBillitCustomer(computed.project);
  if (!customer.Name) throw new Error('Het gekozen project heeft geen klantnaam.');
  const title = `SmartPeak offerte - ${computed.cfg.name || 'configuratie'}`;
  return {
    IsSent: false,
    OrderType: 'Offer',
    OrderDirection: 'Income',
    OrderDate: isoDatePlusDays(0),
    ExpiryDate: isoDatePlusDays(14),
    Description: title,
    OrderTitle: title,
    Customer: customer,
    OrderLines: computed.lines.map(line => ({
      Quantity: 1,
      UnitPriceExcl: Number(Number(line.exVat).toFixed(2)),
      Description: line.description,
      VATPercentage: Number(line.vat) || 21,
      AccountCode: 700010,
    })),
    AccountCode: 700010,
  };
}

function billitConfigTypeForComputed(computed) {
  const explicitType = document.getElementById('quoteConfigType')?.value || '';
  const fallbackType = computed?.cfg?.id ? `PC_${computed.cfg.id}` : '';
  if (explicitType && (!fallbackType || explicitType === fallbackType)) return explicitType;
  return fallbackType;
}

function billitPdfToFile(pdf, orderId) {
  if (!pdf || !pdf.fileContent) throw new Error('Billit gaf geen PDF-bestand terug.');
  const byteChars = atob(pdf.fileContent);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: pdf.mimeType || 'application/pdf' });
  const fileName = pdf.fileName || `billit-offerte-${orderId}.pdf`;
  return new File([blob], fileName, { type: pdf.mimeType || 'application/pdf' });
}

async function attachBillitPdfToProjectConfig(computed, pdf, billitId) {
  const configType = billitConfigTypeForComputed(computed);
  if (!computed?.project?.id || !configType) throw new Error('Kan Billit-offerte niet aan een projectconfig koppelen.');
  const file = billitPdfToFile(pdf, billitId);
  const result = await window.uploadProjectOfferte(computed.project.id, configType, file, {
    source: 'billit',
    billitOrderId: String(billitId),
    billitFileName: pdf.fileName || file.name,
    productConfigId: computed.cfg.id || null,
  });
  if (typeof _onBillitPdfAttached === 'function') await _onBillitPdfAttached();
  return result;
}

async function createBillitOfferFromPreview() {
  const btn = document.getElementById('btnCreateBillitOffer');
  const status = document.getElementById('billitOfferStatus');
  try {
    const computed = buildQuoteComputation();
    if (!computed) throw new Error('Kies eerst een configuratie.');
    const order = buildBillitOfferPayloadForComputed(computed);
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Niet ingelogd.');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Billit-offerte maken...';
    status.textContent = 'Billit-offerte wordt aangemaakt...';
    const token = await user.getIdToken();
    const projectId = firebase.app().options.projectId;
    const endpoint = `https://europe-west1-${projectId}.cloudfunctions.net/createBillitOffer`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Billit request mislukt.');
    const billitId = result.orderId || (result.billit && (result.billit.ID || result.billit.Id || result.billit.id || result.billit));
    if (!billitId) throw new Error('Billit maakte de offerte aan, maar gaf geen order-ID terug.');
    status.textContent = `Billit-offerte aangemaakt (#${billitId}). PDF wordt voorbereid...`;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> PDF voorbereiden...';
    const pdf = await waitForBillitPdf(endpoint, token, billitId, status);
    status.textContent = `PDF voor Billit-offerte #${billitId} wordt aan de projectconfig gekoppeld...`;
    await attachBillitPdfToProjectConfig(computed, pdf, billitId);
    wireBillitPdfDownloadButton(btn, status, pdf, billitId);
    showToast(`Billit-offerte #${billitId} is klaar en gekoppeld aan de configuratie.`, 'success');
  } catch (e) {
    if (status) status.textContent = e.message || String(e);
    showToast('Billit-offerte maken mislukt: ' + (e.message || e), 'danger');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Maak Billit-offerte';
  } finally {
    if (btn && !btn.dataset.pdfReady) btn.disabled = false;
  }
}

async function waitForBillitPdf(endpoint, token, orderId, statusEl) {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pdf-status', orderId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Billit PDF-status ophalen mislukt.');
    if (result.ready && result.file && result.file.fileContent) return result.file;
    if (statusEl) statusEl.textContent = `PDF wordt voorbereid... (${attempt}/${maxAttempts})`;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('PDF is nog niet beschikbaar. Probeer straks opnieuw.');
}

function wireBillitPdfDownloadButton(btn, status, pdf, orderId) {
  btn.disabled = false;
  btn.dataset.pdfReady = '1';
  btn.innerHTML = '<i class="fa-solid fa-file-arrow-down me-1"></i> Download PDF';
  status.textContent = `PDF voor Billit-offerte #${orderId} is beschikbaar.`;
  btn.onclick = () => downloadBase64File(pdf.fileContent, pdf.mimeType || 'application/pdf', pdf.fileName || `billit-offerte-${orderId}.pdf`);
}

function downloadBase64File(base64, mimeType, fileName) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.SmartPeakQuotePreview = {
  openQuoteModal,
};

export { openQuoteModal };
