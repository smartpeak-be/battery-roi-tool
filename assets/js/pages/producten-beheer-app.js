import { sellPrice, unitPrice } from '../product-pricing.js';
import { specsForCategory } from '../product-specs.js';
import {
  GRID_CONNECTION_TYPES,
  gridConnectionLabel,
  normalizeGridCompatibility,
  productConfigGridCompatibility,
} from '../grid-compatibility.js';
import {
  bebatTotalInclVat,
  categoryMap,
  configBatteryWeightKg,
  configItemsExceptCategorySlugs,
  configItemsForCategorySlug,
  configSubtotalExVat,
  generatedConfigDescription,
  addAmountsToVatGroups,
  applyDiscountToVatGroups,
  MATERIAL_CATEGORY_SLUG,
  MISC_CATEGORY_SLUG,
  normalizeProductConfigCustomerType,
  productCalculationReadiness,
  productCalculationReadinessTitle,
  productConfigCalculationReadiness,
  productConfigCalculationReadinessTitle,
  productLabel,
  productMap,
  quoteGroupsProfitExVat,
  quoteGroupSubtotalExVat,
} from '../product-configs.js';
import { escapeHtml, showConfirm } from '../shared-helpers.js';
import { normalizeBillitEmail, normalizeBillitPhone } from '../billit-helpers.js';
import { quoteContextFromSearchParams } from '../quote-context.js';
import { productPricingDefaults } from '../producten-beheer/defaults.js';
import { escapeAttr, productDatasheetsHtml, productPhotosHtml } from '../producten-beheer/renderers.js';

// ─── HELPERS ─────────────────────────────────────────────────────────────

function showToast(message, variant = 'primary') {
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

function showState(which) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hide', id !== which);
  });
}

// ─── TOGGLE BUTTONS (% / €) ──────────────────────────────────────────────

function readToggle(groupId) {
  const group = document.getElementById(groupId);
  return group ? group.dataset.type : 'percent';
}

function setToggle(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.dataset.type = value;
  group.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.val === value);
  });
}

function wireToggleButtons() {
  document.querySelectorAll('[data-type]').forEach(group => {
    group.querySelectorAll('button:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        group.dataset.type = btn.dataset.val;
      });
    });
  });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s = await getSettings();
    _settings = s || {};
    if (s.defaultMarginType) setToggle('marginTypeToggle', s.defaultMarginType);
    if (s.defaultMarginValue != null) document.getElementById('settingsMarginValue').value = s.defaultMarginValue;
    if (s.defaultDiscountType) setToggle('discountTypeToggle', s.defaultDiscountType);
    if (s.defaultDiscountValue != null) document.getElementById('settingsDiscountValue').value = s.defaultDiscountValue;
    if (s.defaultDiscountFromUnit != null) document.getElementById('settingsDiscountFromUnit').value = s.defaultDiscountFromUnit;
    if (s.bebatPricePerKg != null) document.getElementById('settingsBebatPerKg').value = s.bebatPricePerKg;
  } catch (e) {
    console.warn('loadSettings failed:', e);
  }
}

function wireSaveSettings() {
  document.getElementById('btnSaveSettings').addEventListener('click', async () => {
    try {
      await saveSettings({
        defaultMarginType:      readToggle('marginTypeToggle'),
        defaultMarginValue:     parseFloat(document.getElementById('settingsMarginValue').value) || 0,
        defaultDiscountType:    readToggle('discountTypeToggle'),
        defaultDiscountValue:   parseFloat(document.getElementById('settingsDiscountValue').value) || 0,
        defaultDiscountFromUnit: parseInt(document.getElementById('settingsDiscountFromUnit').value) || 2,
        bebatPricePerKg:        parseFloat(document.getElementById('settingsBebatPerKg').value) || 0,
      });
      showToast('Instellingen opgeslagen', 'success');
    } catch (e) {
      showToast('Fout: ' + e.message, 'danger');
    }
  });
}

// ─── SETTINGS COLLAPSE TOGGLE ────────────────────────────────────────────

function wireSettingsCollapse() {
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsBody = document.getElementById('settingsBody');
  const settingsChevron = document.getElementById('settingsChevron');

  // Restore collapse state from localStorage
  const collapsed = localStorage.getItem('smartpeak.settingsCollapsed') === 'true';
  settingsBody.style.display = collapsed ? 'none' : 'block';
  settingsChevron.classList.toggle('fa-chevron-up', !collapsed);
  settingsChevron.classList.toggle('fa-chevron-down', collapsed);

  settingsToggle.addEventListener('click', () => {
    const isHidden = settingsBody.style.display === 'none';
    settingsBody.style.display = isHidden ? 'block' : 'none';
    settingsChevron.classList.toggle('fa-chevron-up', isHidden);
    settingsChevron.classList.toggle('fa-chevron-down', !isHidden);
    localStorage.setItem('smartpeak.settingsCollapsed', !isHidden);
  });
}

function wireProductSectionNav() {
  const buttons = [...document.querySelectorAll('[data-product-nav]')];
  const sections = [...document.querySelectorAll('[data-product-section]')];
  if (!buttons.length || !sections.length) return;

  const validSections = new Set(sections.map(section => section.dataset.productSection));
  const activate = (sectionId) => {
    const nextSection = validSections.has(sectionId) ? sectionId : 'products';
    sections.forEach(section => {
      section.hidden = section.dataset.productSection !== nextSection;
    });
    buttons.forEach(button => {
      const isActive = button.dataset.productNav === nextSection;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    localStorage.setItem('smartpeak.productsSection', nextSection);
  };

  buttons.forEach(button => {
    button.addEventListener('click', () => activate(button.dataset.productNav));
  });
  activate(localStorage.getItem('smartpeak.productsSection') || 'products');
}

// ─── CATEGORY TABS ───────────────────────────────────────────────────────

let _categories = [];
let _activeCategory = null;
let _settings = {};
let _allConfigs = [];
let _editingConfigId = null;
let _quoteProjects = [];
let _quoteVirtualConfig = null;
let _quoteModalOpenedFromUrl = false;

async function seedDefaultCategories() {
  const cats = await listProductCategories();
  if (cats.length > 0) return; // Already seeded
    const defaults = [
      { name: 'Thuisbatterij-systemen', slug: 'thuisbatterij-systemen', isDefault: false, sortOrder: 0 },
      { name: 'Batterijen',  slug: 'batterijen',  isDefault: false, sortOrder: 1 },
      { name: 'Omvormers',   slug: 'omvormers',   isDefault: false, sortOrder: 2 },
      { name: 'Materiaal',   slug: 'materiaal',   isDefault: true,  sortOrder: 3 },
      { name: 'Diversen',    slug: 'diversen',    isDefault: false, sortOrder: 4 },
    ];
  for (const cat of defaults) {
    await createProductCategory(cat);
  }
}

async function loadCategories() {
  try {
    _categories = await listProductCategories();
    renderCategoryTabs();
  } catch (e) {
    console.warn('loadCategories failed:', e);
    showToast('Kon categorieën niet laden: ' + e.message, 'danger');
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  let html = `<button class="btn btn-sm ${!_activeCategory ? 'btn-primary' : 'btn-outline-secondary'}" data-cat="">Alle</button>`;
  _categories.forEach(c => {
    const active = _activeCategory === c.id;
    html += `<button class="btn btn-sm sp-category-filter ${active ? 'btn-primary' : 'btn-outline-secondary'}" style="--sp-cat-color:${escapeAttr(categoryColor(c))}" data-cat="${escapeAttr(c.id)}">${categoryDotHtml(c)}${escapeHtml(c.name)}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeCategory = btn.dataset.cat || null;
      renderCategoryTabs();
      renderProductList();
    });
  });
}

// ─── CATEGORY MODAL ──────────────────────────────────────────────────────

function wireCategoryModal() {
  document.getElementById('btnManageCategories').addEventListener('click', () => {
    renderCategoryModal();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryModal')).show();
  });

  document.getElementById('btnAddCategory').addEventListener('click', () => {
    const container = document.getElementById('categoryList');
    const html = `
      <div class="cat-row d-flex align-items-center gap-2 mb-2" data-id="">
        <i class="fa-solid fa-grip-vertical text-muted" style="cursor:grab;"></i>
        <input type="text" class="form-control cat-name-input" value="" placeholder="Nieuwe categorie">
        <button class="btn btn-outline-danger btn-sm btn-delete-cat" title="Verwijderen">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;
    container.insertAdjacentHTML('beforeend', html);
    const newInput = container.querySelector('.cat-row:last-child .cat-name-input');
    newInput.focus();
    // Wire delete
    container.querySelector('.cat-row:last-child .btn-delete-cat').addEventListener('click', (e) => {
      e.target.closest('.cat-row').remove();
    });
  });

  document.getElementById('btnSaveCategories').addEventListener('click', async () => {
    try {
      const rows = document.querySelectorAll('#categoryList .cat-row');
      const existing = new Set(_categories.map(c => c.id));
      const kept = new Set();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = row.dataset.id;
        const name = row.querySelector('.cat-name-input').value.trim();
        if (!name) continue;

        if (id) {
          // Existing category — update name + sortOrder
          kept.add(id);
          const cat = _categories.find(c => c.id === id);
          if (cat && (cat.name !== name || cat.sortOrder !== i)) {
            await updateProductCategory(id, { name, sortOrder: i });
          }
        } else {
          // New category
          await createProductCategory({ name, sortOrder: i });
        }
      }

      // Delete removed categories (those in existing but not in kept)
      for (const id of existing) {
        if (!kept.has(id)) {
          await deleteProductCategory(id);
        }
      }

      await loadCategories();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryModal')).hide();
      showToast('Categorieën bijgewerkt', 'success');
    } catch (e) {
      showToast('Fout: ' + e.message, 'danger');
    }
  });
}

function renderCategoryModal() {
  const container = document.getElementById('categoryList');
  let html = '';
  _categories.forEach((c) => {
    const isDefault = c.isDefault;
    html += `
      <div class="cat-row d-flex align-items-center gap-2 mb-2 ${isDefault ? 'is-default' : ''}" data-id="${escapeAttr(c.id)}">
        <i class="fa-solid fa-grip-vertical text-muted" style="cursor:grab;"></i>
        <input type="text" class="form-control cat-name-input" value="${escapeAttr(c.name)}">
        ${isDefault ? '<span class="badge text-bg-secondary">Default</span>' : ''}
        <button class="btn btn-outline-danger btn-sm btn-delete-cat" ${isDefault ? 'disabled' : ''} title="Verwijderen">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;
  });
  container.innerHTML = html;

  // Wire delete buttons
  container.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.cat-row');
      row.remove();
    });
  });
}

// ─── PRODUCT MANAGEMENT ──────────────────────────────────────────────────

const BRAND_OPTIONS = {
  'SmartPeak': ['SmartPeak'],
  'Plug & Play': ['Marstek', 'Zendure', 'Growatt', 'EcoFlow', 'Anker Solix', 'Hoymiles', 'Sunpura', 'Bluetti'],
  'Installatie': ['Huawei', 'BYD', 'Dyness', 'Sigenergy', 'Enphase', 'Tesla', 'Sonnen', 'LG', 'Solarwatt', 'Pylontech', 'Alpha ESS', 'SAJ', 'Sungrow', 'Sessy'],
};
const ALL_BRANDS = Object.values(BRAND_OPTIONS).flat();
const STATIC_PRODUCT_MEDIA = {
  acplus: {
    photos: [
      'assets/products/zendure-ac-plus/zendure-acplus-1.png',
      'assets/products/zendure-ac-plus/zendure-acplus-2.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-3.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-4.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-5.jpg',
      'assets/products/zendure-ac-plus/zendure-acplus-6.jpg',
    ],
    datasheets: [{
      name: 'SolarFlow 2400 AC+ — Handleiding (EN/NL)',
      url:  'https://cdn.shopify.com/s/files/1/0722/0956/3903/files/SolarFlow_2400_AC__User_Manual_EN_NL.pdf?v=1770794779',
    }],
  },
  ab3000l: {
    photos: [
      'assets/products/zendure-ac-plus/zendure-acplus-ab3000l.jpg',
    ],
    datasheets: [
      {
        name: 'AB3000L — Handleiding',
        url:  'https://cdn.shopify.com/s/files/1/0722/0956/3903/files/ZDB2503_AB3000L_6_20260104_removed_removed.pdf?v=1770795311',
      },
      {
        name: 'AB3000L — Handleiding EN/FR',
        url:  'https://cdn.shopify.com/s/files/1/0720/4379/0616/files/AB3000L_User_Manual_20260422_EN_FR.pdf?v=1779959908',
      },
    ],
  },
  dynessDl5: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20250428/DL5.0cprojpg.jpg'],
    datasheets: [{
      name: 'Dyness DL5.0C Pro — Datasheet',
      url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/DL5.0CProDatasheetEN20250702.pdf',
    }],
  },
  dynessPowerBrick: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20241211/powerbrickbanner.jpg'],
    datasheets: [{
      name: 'Dyness PowerBrick — Datasheet',
      url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/PowerBrickdatasheetEN20250701-201.pdf',
    }],
  },
  dynessPowerboxG2: {
    photos: ['https://www.dyness.com/Public/Uploads/uploadfile/images/20250605/powerboxG2hei.jpg'],
    datasheets: [
      {
        name: 'Dyness Powerbox G2 — Datasheet',
        url:  'https://www.dyness.com/Public/Uploads/uploadfile/files/20250901/PowerboxG2DatasheetEN20250627.pdf',
      },
      {
        name: 'Dyness Powerbox G2 — User manual',
        url:  'https://nastechsolar.com/content/STORAGE/DYNESS/PRODUCT%20CATALOGUE/Dyness%20Powerbox%20G2%20User%20Manual.pdf',
      },
    ],
  },
  huaweiLunaS1: {
    datasheets: [
      {
        name: 'Huawei LUNA2000-S1 — Officiële specs',
        url:  'https://solar.huawei.com/en/products/LUNA2000-7-14-21-S1/specs/',
      },
      {
        name: 'Huawei LUNA2000-S1 — Datasheet PDF',
        url:  'https://solar.huawei.com/admin/asset/v1/pro/view/36414e3c762a4e508d6fde579866c4c0.pdf',
      },
      {
        name: 'Huawei LUNA2000-S1 — Technical specifications',
        url:  'https://support.huawei.com/enterprise/en/doc/EDOC1100339927/812a69f6/technical-specifications',
      },
    ],
  },
  sigenergyStor: {
    photos: [
      'https://wwwstatic.sigenergy.com/upload/2026-06-03/1780466922268_f5aaf949-2f73-4d39-be6a-a5c9351173d1.webp',
    ],
    datasheets: [{
      name: 'Sigenergy SigenStor — Download center',
      url:  'https://www.sigenergy.com/en/support/download-center.html',
    }],
  },
};

function getCategorySlug(categoryId) {
  const cat = _categories.find(c => c.id === categoryId);
  return cat ? (cat.slug || cat.name || '').toLowerCase() : '';
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

function categoryDotHtml(category, extraClass = '') {
  return `<span class="sp-category-dot ${extraClass}" style="--sp-cat-color:${escapeAttr(categoryColor(category))}"></span>`;
}

function isBrandlessCategorySlug(slug) {
  return slug === 'service' || slug === 'materiaal' || slug === 'diversen';
}

function staticProductMediaKey(product) {
  const haystack = [product?.brand, product?.model, product?.description].filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes('ab3000l')) return 'ab3000l';
  if (haystack.includes('ac+') || haystack.includes('ac plus') || haystack.includes('2400 ac')) return 'acplus';
  if (haystack.includes('dl5.0c')) return 'dynessDl5';
  if (haystack.includes('powerbrick')) return 'dynessPowerBrick';
  if (haystack.includes('powerbox g2')) return 'dynessPowerboxG2';
  if (haystack.includes('luna2000')) return 'huaweiLunaS1';
  if (haystack.includes('sigen')) return 'sigenergyStor';
  return null;
}

function staticProductPhotos(product) {
  const media = STATIC_PRODUCT_MEDIA[staticProductMediaKey(product)];
  return (media?.photos || []).map((url, idx) => ({
    id:          `static-${idx}`,
    name:        url.split('/').pop() || 'Productfoto',
    downloadUrl: url,
    thumbUrl:    url,
    isStatic:    true,
  }));
}

function staticProductDatasheets(product) {
  const media = STATIC_PRODUCT_MEDIA[staticProductMediaKey(product)];
  return (media?.datasheets || []).map((doc, idx) => ({
    id:          `static-${idx}`,
    name:        doc.name,
    downloadUrl: doc.url,
    sizeBytes:   null,
    isStatic:    true,
  }));
}

let _allProducts = [];
let _selectedProductId = null;

async function loadProducts() {
  try {
    _allProducts = await listProducts();
    renderProductList();
    renderConfigList();
  } catch (e) {
    console.error('loadProducts error:', e);
    showToast('Kon producten niet laden: ' + e.message, 'danger');
  }
}

function renderProductList() {
  const list = document.getElementById('productList');
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const showInactive = document.getElementById('toggleShowInactive').checked;
  const categoriesById = categoryMap(_categories);

  let filtered = _allProducts;
  if (_activeCategory) {
    filtered = filtered.filter(p => p.categoryId === _activeCategory);
  }
  if (!showInactive) {
    filtered = filtered.filter(p => p.isActive !== false);
  }
  if (search) {
    filtered = filtered.filter(p =>
      (p.brand || '').toLowerCase().includes(search) ||
      (p.model || '').toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search)
    );
  }

  if (!filtered.length) {
    list.innerHTML = '<p class="text-muted text-center py-4">Geen producten gevonden.</p>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const sp = sellPrice(p);
    const inactiveClass = p.isActive === false ? 'inactive' : '';
    const activeClass = _selectedProductId === p.id ? 'active' : '';
    const badge = p.isActive === false ? '<span class="badge text-bg-secondary ms-2">Inactief</span>' : '';
    const cat = _categories.find(c => c.id === p.categoryId);
    const catName = cat?.name || '';
    const label = productLabel(p, categoriesById);
    const readiness = productCalculationReadiness(p, categoriesById);
    const calcBadge = readiness.relevant
      ? `<span class="badge ${readiness.blockingMissing.length ? 'text-bg-warning' : 'text-bg-success'} ms-2" title="${escapeAttr(productCalculationReadinessTitle(p, categoriesById))}">${readiness.blockingMissing.length ? 'Berekening mist info' : 'Berekening ok'}</span>`
      : '';
    return `
      <div class="card mb-2 product-card sp-product-card ${inactiveClass} ${activeClass}" style="--sp-cat-color:${escapeAttr(categoryColor(cat))}" data-id="${escapeAttr(p.id)}">
        <div class="card-body py-2 px-3 d-flex align-items-center gap-2">
          <div class="flex-grow-1">
            <strong>${escapeHtml(label)}</strong>${badge}${calcBadge}
            <div class="text-muted small">${cat ? categoryDotHtml(cat, 'sp-category-dot-xs') : ''}${escapeHtml(catName)}${p.description ? ' · ' + escapeHtml(p.description) : ''}</div>
          </div>
          <div class="text-end text-nowrap">
            <strong>&euro;${sp.toFixed(2)}</strong>
            <div class="text-muted small">ex BTW</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Wire click handlers
  list.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProductDetail(card.dataset.id));
  });
}

function openProductDetail(productId) {
  _selectedProductId = productId;
  const product = _allProducts.find(p => p.id === productId);
  if (!product) return;

  renderProductList(); // re-render to show active state

  const html = buildDetailFormHtml(product, 'edit');

  // Decide which container to render in based on viewport
  if (window.innerWidth >= 992) {
    // Desktop: render in side panel only
    const desktopBody = document.getElementById('productDetailBody');
    desktopBody.innerHTML = html;
    desktopBody.scrollTop = 0;
    wireDetailForm(desktopBody, product);
  } else {
    // Mobile: render in drawer only
    const drawerBody = document.getElementById('productDrawerBody');
    drawerBody.innerHTML = html;
    wireDetailForm(drawerBody, product);
    document.getElementById('productDrawerTitle').textContent = productLabel(product, categoryMap(_categories));
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('productDrawer')).show();
  }
}

function openNewProduct() {
  _selectedProductId = null;
  renderProductList();

  const html = buildDetailFormHtml(null, 'create');

  if (window.innerWidth >= 992) {
    // Desktop: render in side panel only
    const desktopBody = document.getElementById('productDetailBody');
    desktopBody.innerHTML = html;
    desktopBody.scrollTop = 0;
    wireDetailForm(desktopBody, null);
  } else {
    // Mobile: render in drawer only
    const drawerBody = document.getElementById('productDrawerBody');
    drawerBody.innerHTML = html;
    wireDetailForm(drawerBody, null);
    document.getElementById('productDrawerTitle').textContent = 'Nieuw product';
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('productDrawer')).show();
  }
}

function buildBrandOptions(selectedBrand) {
  let html = '<option value="">— Kies merk —</option>';
  for (const [group, brands] of Object.entries(BRAND_OPTIONS)) {
    html += `<optgroup label="${escapeAttr(group)}">`;
    brands.forEach(b => {
      html += `<option value="${escapeAttr(b)}" ${b === selectedBrand ? 'selected' : ''}>${escapeHtml(b)}</option>`;
    });
    html += '</optgroup>';
  }
  const isCustom = selectedBrand && !ALL_BRANDS.includes(selectedBrand);
  html += `<option value="__other__" ${isCustom ? 'selected' : ''}>Andere…</option>`;
  return html;
}

function gridCompatibilityCheckboxesHtml(values) {
  const selected = new Set(normalizeGridCompatibility(values));
  return GRID_CONNECTION_TYPES.map(type => `
    <label class="form-check mb-2">
      <input class="form-check-input" type="checkbox" data-grid-connection="${escapeAttr(type.value)}" ${selected.has(type.value) ? 'checked' : ''}>
      <span class="form-check-label">
        <strong>${escapeHtml(type.label)}</strong>
        <span class="d-block small text-muted">${escapeHtml(type.description)}</span>
      </span>
    </label>
  `).join('');
}

function readGridCompatibilityFromForm(container) {
  return normalizeGridCompatibility([...container.querySelectorAll('[data-grid-connection]:checked')]
    .map(input => input.dataset.gridConnection));
}

function buildDetailFormHtml(product, mode) {
  const p = product || {};
  const isCreate = mode === 'create';

  // Get pricing defaults from settings for new products
  const {
    marginType,
    marginValue,
    discountType,
    discountValue,
    discountFromUnit,
  } = productPricingDefaults(product, _settings);

  const isCustomBrand = p.brand && !ALL_BRANDS.includes(p.brand);
  const isBrandless = isBrandlessCategorySlug(getCategorySlug(p.categoryId));

  return `
    <div class="product-detail-form">
      <!-- Blok A: Basis -->
      <h6 class="text-muted mb-3"><i class="fa-solid fa-box me-1"></i> Basis</h6>

      <div class="mb-3">
        <label class="form-label">Categorie <span class="text-danger">*</span></label>
        <select class="form-select detail-category">
          <option value="">— Kies categorie —</option>
          ${_categories.map(c => `<option value="${escapeAttr(c.id)}" ${p.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6 ${isBrandless ? 'd-none' : ''}" data-brand-group>
          <label class="form-label">Merk <span class="text-danger">*</span></label>
          <select class="form-select detail-brand-select">
            ${buildBrandOptions(p.brand || '')}
          </select>
        </div>
        <div class="col-6 ${isCustomBrand ? '' : 'd-none'}" data-custom-brand-group>
          <label class="form-label">Merk (vrij)</label>
          <input type="text" class="form-control detail-custom-brand" value="${isCustomBrand ? escapeAttr(p.brand) : ''}" placeholder="Voer merk in">
        </div>
        <div class="col-6">
          <label class="form-label detail-model-label">${isBrandless ? 'Naam' : 'Model'} <span class="text-danger">*</span></label>
          <input type="text" class="form-control detail-model" value="${escapeAttr(p.model || '')}">
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">Omschrijving</label>
        <textarea class="form-control detail-description" rows="2">${escapeHtml(p.description || '')}</textarea>
      </div>

      <hr>

      <!-- Blok B: Prijzen -->
      <h6 class="text-muted mb-3"><i class="fa-solid fa-euro-sign me-1"></i> Prijzen</h6>

      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label">Aankoopprijs (ex BTW) <span class="text-danger">*</span></label>
          <div class="input-group">
            <span class="input-group-text">&euro;</span>
            <input type="number" class="form-control detail-purchase-price" min="0" step="0.01" value="${escapeAttr(p.purchasePrice ?? '')}">
          </div>
        </div>
        <div class="col-6">
          <label class="form-label">Verkoopprijs</label>
          <div class="input-group">
            <span class="input-group-text">&euro;</span>
            <input type="text" class="form-control detail-preview-sell-price" readonly disabled value="—">
          </div>
        </div>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-8">
          <label class="form-label">Winstmarge</label>
          <div class="input-group">
            <div class="btn-group detail-margin-type" role="group" data-type="${escapeAttr(marginType)}">
              <button type="button" class="btn btn-outline-secondary btn-sm ${marginType === 'percent' ? 'active' : ''}" data-val="percent">%</button>
              <button type="button" class="btn btn-outline-secondary btn-sm ${marginType === 'fixed' ? 'active' : ''}" data-val="fixed">&euro;</button>
            </div>
            <input type="number" class="form-control detail-margin-value" min="0" step="1" value="${escapeAttr(marginValue)}">
          </div>
        </div>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-8">
          <label class="form-label">Korting</label>
          <div class="input-group">
            <div class="btn-group detail-discount-type" role="group" data-type="${escapeAttr(discountType)}">
              <button type="button" class="btn btn-outline-secondary btn-sm ${discountType === 'percent' ? 'active' : ''}" data-val="percent">%</button>
              <button type="button" class="btn btn-outline-secondary btn-sm ${discountType === 'fixed' ? 'active' : ''}" data-val="fixed">&euro;</button>
            </div>
            <input type="number" class="form-control detail-discount-value" min="0" step="0.01" value="${escapeAttr(discountValue)}">
          </div>
        </div>
        <div class="col-4">
          <label class="form-label">Vanaf eenheid</label>
          <input type="number" class="form-control detail-discount-from-unit" min="1" step="1" value="${escapeAttr(discountFromUnit)}">
        </div>
      </div>

      <div class="alert alert-light border py-2 px-3 mb-3">
        <small class="text-muted">
          <strong>Verkoopprijs:</strong> <span class="detail-preview-sp">—</span>
          <span class="detail-preview-sp-winst text-success"></span><br>
          <strong>Kortingsprijs</strong> <span class="detail-preview-korting-label">(vanaf 2e)</span><strong>:</strong>
          <span class="detail-preview-u2">—</span>
          <span class="detail-preview-u2-winst text-success"></span>
        </small>
      </div>

      <hr>

      <!-- Blok C: Specificaties -->
      <h6 class="text-muted mb-3"><i class="fa-solid fa-list-check me-1"></i> Specificaties</h6>
      <div class="spec-fields-container"></div>

      <div class="border rounded p-3 mt-3 grid-compatibility-fields">
        <label class="form-label fw-bold mb-2"><i class="fa-solid fa-plug-circle-check me-1"></i> Geschikte nettypes</label>
        <p class="small text-muted mb-2">Duid alle netten aan waarop dit product volgens datasheet/fabrikant mag worden aangesloten. Laat leeg voor DC- of niet-elektrische producten.</p>
        ${gridCompatibilityCheckboxesHtml(p.gridCompatibility)}
      </div>

      <div class="custom-specs-container mt-3">
        <label class="form-label fw-bold small">Extra specificaties</label>
        <div class="custom-specs-list"></div>
        <button type="button" class="btn btn-outline-secondary btn-sm mt-1 btn-add-custom-spec">
          <i class="fa-solid fa-plus me-1"></i> Toevoegen
        </button>
      </div>

      ${!isCreate ? `
      <hr>

      <!-- Blok D: Foto's -->
      <h6 class="text-muted mb-3"><i class="fa-solid fa-images me-1"></i> Foto's</h6>
      <div class="product-photo-grid mb-2" data-product-id="${escapeAttr(p.id)}"></div>
      <div class="media-drop-zone photo-drop-zone mb-1" data-product-id="${escapeAttr(p.id)}">
        <i class="fa-solid fa-cloud-arrow-up me-1"></i> Sleep foto's hierheen of klik om te uploaden
        <input type="file" accept="image/*" multiple class="photo-file-input">
      </div>
      <div class="progress mt-1 d-none photo-progress" style="height: 6px;">
        <div class="progress-bar" role="progressbar" style="width: 0%"></div>
      </div>

      <hr>

      <!-- Blok D: Datasheets -->
      <h6 class="text-muted mb-3"><i class="fa-solid fa-file-pdf me-1"></i> Datasheets</h6>
      <div class="datasheet-list mb-2" data-product-id="${escapeAttr(p.id)}"></div>
      <div class="media-drop-zone datasheet-drop-zone mb-1" data-product-id="${escapeAttr(p.id)}">
        <i class="fa-solid fa-cloud-arrow-up me-1"></i> Sleep PDF hierheen of klik om te uploaden
        <input type="file" accept="application/pdf" class="datasheet-file-input">
      </div>
      <div class="progress mt-1 d-none datasheet-progress" style="height: 6px;">
        <div class="progress-bar" role="progressbar" style="width: 0%"></div>
      </div>
      ` : ''}

      <hr>

      <!-- Actions -->
      <div class="detail-actions d-flex gap-2 flex-wrap">
        <button class="btn btn-primary detail-btn-save">
          <i class="fa-solid fa-floppy-disk me-1"></i> ${isCreate ? 'Aanmaken' : 'Opslaan'}
        </button>
        ${!isCreate ? `
          <button class="btn btn-outline-warning detail-btn-toggle-active">
            <i class="fa-solid fa-${p.isActive === false ? 'eye' : 'eye-slash'} me-1"></i> ${p.isActive === false ? 'Heractiveren' : 'Deactiveren'}
          </button>
          <button class="btn btn-outline-danger ms-auto detail-btn-delete">
            <i class="fa-solid fa-trash me-1"></i> Verwijderen
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function wireDetailForm(container, product) {
  // Wire brand "Andere" toggle
  const brandSelect = container.querySelector('.detail-brand-select');
  const customBrandGroup = container.querySelector('[data-custom-brand-group]');
  if (brandSelect) {
    brandSelect.addEventListener('change', () => {
      customBrandGroup.classList.toggle('d-none', brandSelect.value !== '__other__');
    });
  }

  toggleServiceProductFields(container);

  // Wire toggle buttons inside the detail form
  container.querySelectorAll('.product-detail-form [data-type]').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        group.dataset.type = btn.dataset.val;
        updatePricePreview(container);
      });
    });
  });

  // Wire live price preview
  ['detail-purchase-price', 'detail-margin-value', 'detail-discount-value', 'detail-discount-from-unit'].forEach(className => {
    const el = container.querySelector('.' + className);
    if (el) el.addEventListener('input', () => updatePricePreview(container));
  });

  // Initial price preview
  updatePricePreview(container);

  // Render spec fields for current category
  const currentCatId = container.querySelector('.detail-category').value;
  renderSpecFields(container, currentCatId, product?.specs || {});
  renderCustomSpecs(container, product?.specs?.custom || {});

  // Re-render specs on category change
  const catSelect = container.querySelector('.detail-category');
  catSelect.addEventListener('change', () => {
    renderSpecFields(container, catSelect.value, {});
    toggleServiceProductFields(container);
  });

  // Wire custom spec add button
  const addCustomBtn = container.querySelector('.btn-add-custom-spec');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => addCustomSpecRow(container));
  }

  // Wire media sections (only for existing products)
  if (product) {
    wirePhotoSection(container, product.id);
    wireDatasheetSection(container, product.id);
  }

  // Wire save button
  const saveBtn = container.querySelector('.detail-btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveProductFromForm(container, product));
  }

  // Wire toggle active button
  const toggleBtn = container.querySelector('.detail-btn-toggle-active');
  if (toggleBtn && product) {
    toggleBtn.addEventListener('click', async () => {
      try {
        const newActive = product.isActive === false;
        await toggleProductActive(product.id, newActive);
        showToast(newActive ? 'Product geheractiveerd' : 'Product gedeactiveerd', 'success');
        await loadProducts();
        if (newActive) {
          openProductDetail(product.id);
        } else {
          resetDetailPanel();
        }
      } catch (e) {
        showToast('Fout: ' + e.message, 'danger');
      }
    });
  }

  // Wire delete button
  const deleteBtn = container.querySelector('.detail-btn-delete');
  if (deleteBtn && product) {
    deleteBtn.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: 'Product verwijderen?',
        message: `"${productLabel(product, categoryMap(_categories))}" wordt permanent verwijderd. Dit kan niet ongedaan worden.`,
        confirmText: 'Product verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteProduct(product.id);
        showToast('Product verwijderd', 'success');
        await loadProducts();
        resetDetailPanel();
        // Close drawer on mobile
        try { bootstrap.Offcanvas.getInstance(document.getElementById('productDrawer'))?.hide(); } catch {}
      } catch (e) {
        showToast('Fout: ' + e.message, 'danger');
      }
    });
  }
}

function toggleServiceProductFields(container) {
  const isBrandless = isBrandlessCategorySlug(getCategorySlug(container.querySelector('.detail-category')?.value));
  container.querySelector('[data-brand-group]')?.classList.toggle('d-none', isBrandless);
  container.querySelector('[data-custom-brand-group]')?.classList.toggle('d-none', isBrandless || container.querySelector('.detail-brand-select')?.value !== '__other__');
  const label = container.querySelector('.detail-model-label');
  if (label) label.innerHTML = `${isBrandless ? 'Naam' : 'Model'} <span class="text-danger">*</span>`;
}

// ─── PRODUCT PHOTO SECTION ────────────────────────────────────────────────────

function wirePhotoSection(container, productId) {
  const grid     = container.querySelector('.product-photo-grid');
  const dropZone = container.querySelector('.photo-drop-zone');
  const fileInput= container.querySelector('.photo-file-input');
  const progress = container.querySelector('.photo-progress');
  if (!grid || !dropZone) return;

  // Load existing photos
  renderProductPhotos(grid, productId);

  // Click to upload
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length) {
      const files = [...fileInput.files];
      fileInput.value = '';
      await handlePhotoUpload(grid, productId, files, progress);
    }
  });

  // Drag-drop
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length) handlePhotoUpload(grid, productId, files, progress);
  });

  // Delegated click: delete + lightbox
  grid.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.photo-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const item = deleteBtn.closest('.photo-item');
      const { photoId, storagePath, thumbStoragePath } = item.dataset;
      const ok = await showConfirm({
        title: 'Foto verwijderen?',
        message: 'Deze productfoto wordt permanent verwijderd.',
        confirmText: 'Foto verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteProductPhoto(productId, photoId, storagePath, thumbStoragePath || '');
        item.remove();
        showToast('Foto verwijderd', 'success');
      } catch (err) { showToast('Fout: ' + err.message, 'danger'); }
      return;
    }
    const thumb = e.target.closest('.photo-thumb');
    if (thumb) {
      const fullUrl = thumb.dataset.fullUrl;
      if (fullUrl) openProductLightbox(fullUrl);
    }
  });
}

async function handlePhotoUpload(grid, productId, files, progressEl) {
  progressEl.classList.remove('d-none');
  const bar = progressEl.querySelector('.progress-bar');
  let done = 0;
  for (const file of files) {
    try {
      await uploadProductPhoto(productId, file);
      done++;
      bar.style.width = `${Math.round((done / files.length) * 100)}%`;
    } catch (err) {
      showToast('Upload mislukt: ' + err.message, 'danger');
    }
  }
  progressEl.classList.add('d-none');
  bar.style.width = '0%';
  await renderProductPhotos(grid, productId);
  if (done > 0) showToast(`${done} foto('s) geupload`, 'success');
}

async function renderProductPhotos(grid, productId) {
  grid.innerHTML = '<span class="text-muted small">Laden...</span>';
  try {
    const product = _allProducts.find(p => p.id === productId);
    const staticPhotos = staticProductPhotos(product);
    const photos = await listProductPhotos(productId);
    const allPhotos = [...staticPhotos, ...photos];
    if (!allPhotos.length) { grid.innerHTML = '<span class="text-muted small">Geen foto\'s</span>'; return; }
    grid.innerHTML = productPhotosHtml(allPhotos);
  } catch (err) {
    grid.innerHTML = '<span class="text-danger small">Fout bij laden foto\'s</span>';
    console.error('renderProductPhotos', err);
  }
}

function openProductLightbox(url) {
  const overlay = document.createElement('div');
  overlay.className = 'product-lightbox-overlay';
  const img = document.createElement('img');
  img.src = url || '';
  img.alt = 'Foto';
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(overlay);
}

// ─── PRODUCT DATASHEET SECTION ────────────────────────────────────────────────

function wireDatasheetSection(container, productId) {
  const list     = container.querySelector('.datasheet-list');
  const dropZone = container.querySelector('.datasheet-drop-zone');
  const fileInput= container.querySelector('.datasheet-file-input');
  const progress = container.querySelector('.datasheet-progress');
  if (!list || !dropZone) return;

  // Load existing datasheets
  renderProductDatasheets(list, productId);

  // Click to upload
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length) {
      await handleDatasheetUpload(list, productId, fileInput.files[0], progress);
    }
    fileInput.value = '';
  });

  // Drag-drop
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = [...e.dataTransfer.files].find(f => f.type === 'application/pdf');
    if (file) await handleDatasheetUpload(list, productId, file, progress);
    else showToast('Enkel PDF-bestanden worden aanvaard', 'warning');
  });

  // Delegated click: delete + download
  list.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.ds-delete-btn');
    if (deleteBtn) {
      e.preventDefault();
      const row = deleteBtn.closest('.ds-row');
      const { dsId, storagePath } = row.dataset;
      const ok = await showConfirm({
        title: 'Datasheet verwijderen?',
        message: 'Deze datasheet wordt permanent verwijderd.',
        confirmText: 'Datasheet verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteProductDatasheet(productId, dsId, storagePath);
        row.remove();
        if (!list.querySelector('.ds-row')) list.innerHTML = '<span class="text-muted small">Geen datasheets</span>';
        showToast('Datasheet verwijderd', 'success');
      } catch (err) { showToast('Fout: ' + err.message, 'danger'); }
    }
  });
}

async function handleDatasheetUpload(list, productId, file, progressEl) {
  progressEl.classList.remove('d-none');
  const bar = progressEl.querySelector('.progress-bar');
  bar.style.width = '50%';
  try {
    await uploadProductDatasheet(productId, file);
    bar.style.width = '100%';
    showToast('Datasheet geupload', 'success');
    await renderProductDatasheets(list, productId);
  } catch (err) {
    showToast('Upload mislukt: ' + err.message, 'danger');
  }
  progressEl.classList.add('d-none');
  bar.style.width = '0%';
}

async function renderProductDatasheets(list, productId) {
  list.innerHTML = '<span class="text-muted small">Laden...</span>';
  try {
    const product = _allProducts.find(p => p.id === productId);
    const staticDocs = staticProductDatasheets(product);
    const docs = await listProductDatasheets(productId);
    const allDocs = [...staticDocs, ...docs];
    if (!allDocs.length) { list.innerHTML = '<span class="text-muted small">Geen datasheets</span>'; return; }
    list.innerHTML = productDatasheetsHtml(allDocs);
  } catch (err) {
    list.innerHTML = '<span class="text-danger small">Fout bij laden datasheets</span>';
    console.error('renderProductDatasheets', err);
  }
}

function renderSpecFields(container, categoryId, existingSpecs) {
  const slug = getCategorySlug(categoryId);
  const fields = specsForCategory(slug);
  const specsContainer = container.querySelector('.spec-fields-container');
  if (!specsContainer) return;
  const specs = existingSpecs || {};

  if (!fields.length) {
    specsContainer.innerHTML = '<p class="text-muted small mb-0">Kies een categorie om specificatievelden te zien.</p>';
    return;
  }

  let html = '<div class="row g-2">';
  fields.forEach(f => {
    const val = specs[f.key];
    const isCalcCritical = ['capacityKwh', 'inverterPowerKw'].includes(f.key);
    const isCalcDefaulted = f.key === 'efficiency';
    const calcHint = isCalcCritical
      ? '<span class="badge text-bg-info ms-1" title="Cruciaal voor de calculator">calculator</span>'
      : (isCalcDefaulted ? '<span class="badge text-bg-light text-muted border ms-1" title="Gebruikt voor de calculator; zonder waarde valt de calculator terug op 90% rendement">calculator optioneel</span>' : '');
    html += '<div class="col-6 col-md-4">';
    html += `<label class="form-label small mb-1">${escapeHtml(f.label)}${f.unit ? ' <span class="text-muted">(' + escapeHtml(f.unit) + ')</span>' : ''}${calcHint}</label>`;

    if (f.type === 'number') {
      html += `<input type="number" class="form-control form-control-sm spec-field" data-spec-key="${escapeAttr(f.key)}" step="any" value="${val != null ? escapeAttr(val) : ''}">`;
    } else if (f.type === 'text') {
      html += `<input type="text" class="form-control form-control-sm spec-field" data-spec-key="${escapeAttr(f.key)}" value="${val != null ? escapeAttr(val) : ''}">`;
    } else if (f.type === 'select') {
      html += `<select class="form-select form-select-sm spec-field" data-spec-key="${escapeAttr(f.key)}">`;
      html += '<option value="">—</option>';
      (f.options || []).forEach(opt => {
        html += `<option value="${escapeAttr(opt)}" ${String(val) === String(opt) ? 'selected' : ''}>${escapeHtml(String(opt))}</option>`;
      });
      html += '</select>';
    } else if (f.type === 'boolean') {
      html += `<div class="form-check mt-1"><input type="checkbox" class="form-check-input spec-field" data-spec-key="${escapeAttr(f.key)}" ${val ? 'checked' : ''}><label class="form-check-label small">Ja</label></div>`;
    }

    html += '</div>';
  });
  html += '</div>';
  specsContainer.innerHTML = html;
}

function renderCustomSpecs(container, customSpecs) {
  const list = container.querySelector('.custom-specs-list');
  if (!list) return;
  const entries = Object.entries(customSpecs || {});

  if (!entries.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = entries.map(([key, value]) => `
    <div class="d-flex gap-2 mb-2 custom-spec-row">
      <input type="text" class="form-control form-control-sm custom-spec-key" value="${escapeAttr(key)}" placeholder="Naam">
      <input type="text" class="form-control form-control-sm custom-spec-value" value="${escapeAttr(value)}" placeholder="Waarde">
      <button type="button" class="btn btn-outline-danger btn-sm btn-delete-custom-spec"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');

  list.querySelectorAll('.btn-delete-custom-spec').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.custom-spec-row').remove());
  });
}

function addCustomSpecRow(container) {
  const list = container.querySelector('.custom-specs-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'd-flex gap-2 mb-2 custom-spec-row';
  row.innerHTML = `
    <input type="text" class="form-control form-control-sm custom-spec-key" placeholder="Naam">
    <input type="text" class="form-control form-control-sm custom-spec-value" placeholder="Waarde">
    <button type="button" class="btn btn-outline-danger btn-sm btn-delete-custom-spec"><i class="fa-solid fa-trash"></i></button>
  `;
  list.appendChild(row);
  row.querySelector('.btn-delete-custom-spec').addEventListener('click', () => row.remove());
  row.querySelector('.custom-spec-key').focus();
}

function readProductFromForm(container) {
  const brandSelect = container.querySelector('.detail-brand-select');
  let brand = brandSelect.value;
  const categoryId = container.querySelector('.detail-category').value;
  const isBrandless = isBrandlessCategorySlug(getCategorySlug(categoryId));
  if (brand === '__other__') {
    brand = container.querySelector('.detail-custom-brand').value.trim();
  }
  let model = container.querySelector('.detail-model').value.trim();
  if (isBrandless) {
    if (brand && model && !model.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
      model = `${brand} ${model}`;
    }
    brand = '';
  }

  // Read typed specs
  const specs = {};
  container.querySelectorAll('.spec-field').forEach(el => {
    const key = el.dataset.specKey;
    if (!key) return;
    if (el.type === 'checkbox') {
      specs[key] = el.checked;
    } else if (el.type === 'number') {
      const v = parseFloat(el.value);
      if (!isNaN(v)) specs[key] = v;
    } else if (el.value && el.value.trim()) {
      specs[key] = el.value.trim();
    }
  });

  // Read custom specs
  const custom = {};
  container.querySelectorAll('.custom-spec-row').forEach(row => {
    const k = row.querySelector('.custom-spec-key').value.trim();
    const v = row.querySelector('.custom-spec-value').value.trim();
    if (k && v) custom[k] = v;
  });
  if (Object.keys(custom).length) specs.custom = custom;

  return {
    categoryId,
    brand,
    model,
    description: container.querySelector('.detail-description').value.trim(),
    purchasePrice: parseFloat(container.querySelector('.detail-purchase-price').value) || 0,
    marginType: container.querySelector('.detail-margin-type')?.dataset.type || 'percent',
    marginValue: parseFloat(container.querySelector('.detail-margin-value').value) || 0,
    discountType: container.querySelector('.detail-discount-type')?.dataset.type || 'percent',
    discountValue: parseFloat(container.querySelector('.detail-discount-value').value) || 0,
    discountFromUnit: parseInt(container.querySelector('.detail-discount-from-unit').value) || 2,
    gridCompatibility: readGridCompatibilityFromForm(container),
    specs,
    serviceKey: specs.serviceKey || null,
  };
}

function updatePricePreview(container) {
  const data = readProductFromForm(container);
  const pp = data.purchasePrice || 0;
  const hasPurchasePrice = container.querySelector('.detail-purchase-price').value.trim() !== '';
  const sp = sellPrice(data);
  const fromUnit = data.discountFromUnit || 2;
  const kp = unitPrice(data, fromUnit);

  const previewSp = container.querySelector('.detail-preview-sp');
  const previewU2 = container.querySelector('.detail-preview-u2');
  const previewSellPrice = container.querySelector('.detail-preview-sell-price');
  const previewSpWinst = container.querySelector('.detail-preview-sp-winst');
  const previewU2Winst = container.querySelector('.detail-preview-u2-winst');
  const kortingLabel = container.querySelector('.detail-preview-korting-label');

  if (previewSp) previewSp.textContent = hasPurchasePrice ? `€${sp.toFixed(2)}` : '—';
  if (previewU2) previewU2.textContent = hasPurchasePrice ? `€${kp.toFixed(2)}` : '—';
  if (previewSellPrice) previewSellPrice.value = hasPurchasePrice ? sp.toFixed(2) : '—';
  if (previewSpWinst) previewSpWinst.textContent = hasPurchasePrice ? `(winst €${(sp - pp).toFixed(2)})` : '';
  if (previewU2Winst) previewU2Winst.textContent = hasPurchasePrice ? `(winst €${(kp - pp).toFixed(2)})` : '';
  if (kortingLabel) kortingLabel.textContent = `(vanaf ${fromUnit}e)`;
}

async function saveProductFromForm(container, existingProduct) {
  const data = readProductFromForm(container);
  const categorySlug = getCategorySlug(data.categoryId);
  const isService = categorySlug === 'service';
  const isBrandless = isBrandlessCategorySlug(categorySlug);
  if (isBrandless) data.brand = '';

  // Validate
  if (!data.categoryId) { showToast('Kies een categorie', 'danger'); return; }
  if (!data.brand && !isBrandless) { showToast('Vul een merk in', 'danger'); return; }
  if (!data.model) { showToast(isBrandless ? 'Vul een naam in' : 'Vul een model in', 'danger'); return; }
  const purchaseInput = container.querySelector('.detail-purchase-price').value.trim();
  if (!purchaseInput && !isService) { showToast('Vul een aankoopprijs in', 'danger'); return; }
  if (data.purchasePrice < 0) { showToast('Aankoopprijs mag niet negatief zijn', 'danger'); return; }
  if (data.marginValue < 0) { showToast('Winstmarge mag niet negatief zijn', 'danger'); return; }
  if (data.discountValue < 0) { showToast('Korting mag niet negatief zijn', 'danger'); return; }
  if (data.discountFromUnit < 1) { showToast('Korting vanaf eenheid moet minstens 1 zijn', 'danger'); return; }

  try {
    if (existingProduct) {
      await updateProduct(existingProduct.id, data);
      showToast('Product bijgewerkt', 'success');
      await loadProducts();
      openProductDetail(existingProduct.id);
    } else {
      const newId = await createProduct(data);
      showToast('Product aangemaakt', 'success');
      await loadProducts();
      openProductDetail(newId);
      // Close drawer on mobile (will reopen with new product)
      try { bootstrap.Offcanvas.getInstance(document.getElementById('productDrawer'))?.hide(); } catch {}
    }
  } catch (e) {
    showToast('Fout: ' + e.message, 'danger');
  }
}

function resetDetailPanel() {
  _selectedProductId = null;
  renderProductList();
  document.getElementById('productDetailBody').innerHTML = '<p class="text-muted text-center py-4">Selecteer een product of maak een nieuw product aan.</p>';
  document.getElementById('productDrawerBody').innerHTML = '';
}

// ─── PRODUCT CONFIGURATIONS ───────────────────────────────────────────────

async function loadConfigs() {
  try {
    _allConfigs = await listProductConfigs();
    renderConfigList();
  } catch (e) {
    console.error('loadConfigs error:', e);
    showToast('Kon configuraties niet laden: ' + e.message, 'danger');
  }
}

function _maps() {
  return {
    productsById: productMap(_allProducts),
    categoriesById: categoryMap(_categories),
  };
}

function renderConfigList() {
  const el = document.getElementById('configList');
  if (!el) return;
  const { productsById, categoriesById } = _maps();
  if (!_allConfigs.length) {
    el.innerHTML = '<p class="text-muted mb-0">Nog geen configuraties.</p>';
    return;
  }
  el.innerHTML = _allConfigs.map(cfg => {
    const desc = generatedConfigDescription(cfg.items, productsById, categoriesById) || cfg.description || 'Geen producten';
    const subtotal = configSubtotalExVat(cfg.items, productsById, categoriesById);
    const inactive = cfg.isActive === false ? '<span class="badge text-bg-secondary ms-2">Inactief</span>' : '';
    const customerType = normalizeProductConfigCustomerType(cfg.customerType, cfg);
    const customerBadge = customerType === 'b2b'
      ? '<span class="badge text-bg-warning ms-2">B2B</span>'
      : '<span class="badge text-bg-success ms-2">B2C</span>';
    const readiness = productConfigCalculationReadiness(cfg, productsById, categoriesById);
    const readinessTitle = productConfigCalculationReadinessTitle(cfg, productsById, categoriesById);
    const readinessBadge = readiness.eligible
      ? `<span class="badge text-bg-success ms-2" title="${escapeAttr(readinessTitle)}">In calculator</span>`
      : `<span class="badge text-bg-danger ms-2" title="${escapeAttr(readinessTitle)}">Niet in calculator</span>`;
    const grid = productConfigGridCompatibility(cfg, productsById);
    const gridBadges = grid.hasConflict
      ? '<span class="badge text-bg-danger mt-1" title="De AC-producten hebben geen gemeenschappelijk geschikt nettype">Netconflict</span>'
      : (grid.gridCompatibility.length
        ? grid.gridCompatibility.map(value => `<span class="badge text-bg-light border text-dark me-1 mt-1">${escapeHtml(gridConnectionLabel(value))}</span>`).join('')
        : '<span class="badge text-bg-light border text-muted mt-1">Nettypes nog onbekend</span>');
    return `
      <div class="border rounded p-2 mb-2 config-row" data-config-id="${escapeAttr(cfg.id)}">
        <div class="d-flex gap-2 align-items-start">
          <div class="flex-grow-1">
            <strong>${escapeHtml(cfg.name || '(zonder naam)')}</strong>${customerBadge}${inactive}${readinessBadge}
            <div class="text-muted small">${escapeHtml(desc)}</div>
            <div>${gridBadges}</div>
          </div>
          <div class="text-end text-nowrap">
            <strong>€${subtotal.toFixed(2)}</strong>
            <div class="text-muted small">ex BTW</div>
          </div>
          <button class="btn btn-sm btn-outline-primary" data-config-edit="${escapeAttr(cfg.id)}" title="Bewerken"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-outline-secondary" data-config-duplicate="${escapeAttr(cfg.id)}" title="Dupliceren"><i class="fa-solid fa-copy"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-config-delete="${escapeAttr(cfg.id)}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-config-edit]').forEach(btn => {
    btn.addEventListener('click', () => openConfigModal(btn.dataset.configEdit));
  });
  el.querySelectorAll('[data-config-duplicate]').forEach(btn => {
    btn.addEventListener('click', () => openConfigDuplicateModal(btn.dataset.configDuplicate));
  });
  el.querySelectorAll('[data-config-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cfg = _allConfigs.find(c => c.id === btn.dataset.configDelete);
      const ok = await showConfirm({
        title: 'Configuratie verwijderen?',
        message: `"${cfg?.name || 'Deze configuratie'}" wordt permanent verwijderd.`,
        confirmText: 'Verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteProductConfig(btn.dataset.configDelete);
        await loadConfigs();
        showToast('Configuratie verwijderd', 'success');
      } catch (e) {
        showToast('Verwijderen mislukt: ' + e.message, 'danger');
      }
    });
  });
}

function duplicateConfigDraft(cfg) {
  return {
    name: `${cfg.name || 'Configuratie'} (kopie)`,
    description: cfg.description || '',
    customerType: normalizeProductConfigCustomerType(cfg.customerType, cfg),
    sortOrder: cfg.sortOrder ?? 0,
    isActive: cfg.isActive !== false,
    items: (cfg.items || []).map(item => ({
      productId: item.productId,
      qty: item.qty,
    })),
  };
}

function openConfigDuplicateModal(configId) {
  const cfg = _allConfigs.find(c => c.id === configId);
  if (!cfg) {
    showToast('Configuratie niet gevonden', 'danger');
    return;
  }
  openConfigModal(null, duplicateConfigDraft(cfg));
}

function openConfigModal(configId = null, draftConfig = null) {
  _editingConfigId = configId;
  const cfg = configId ? _allConfigs.find(c => c.id === configId) : draftConfig;
  document.getElementById('configModalTitle').textContent = configId
    ? 'Configuratie bewerken'
    : (draftConfig ? 'Configuratie dupliceren' : 'Nieuwe configuratie');
  document.getElementById('configModalBody').innerHTML = buildConfigFormHtml(cfg);
  wireConfigForm();
  updateConfigPreview();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('configModal')).show();
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

function configItemRowHtml(item = {}) {
  return `
    <div class="row g-2 align-items-end mb-2 config-item-row">
      <div class="col-8">
        <label class="form-label small mb-1">Product</label>
        <select class="form-select config-item-product">${productOptionsHtml(item.productId || '')}</select>
      </div>
      <div class="col-2">
        <label class="form-label small mb-1">Aantal</label>
        <input type="number" min="1" step="1" class="form-control config-item-qty" value="${escapeAttr(item.qty || 1)}">
      </div>
      <div class="col-2">
        <button type="button" class="btn btn-outline-danger w-100 config-item-remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function buildConfigFormHtml(cfg) {
  const items = (cfg && cfg.items && cfg.items.length) ? cfg.items : [{ qty: 1 }];
  return `
    <div class="row g-3">
      <div class="col-md-7">
        <label class="form-label">Naam <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="configName" value="${escapeAttr(cfg?.name || '')}" placeholder="bv. Zendure AC+ 1 hub + 3 batterijen">
      </div>
      <div class="col-md-2">
        <label class="form-label">Doelgroep</label>
        <select class="form-select" id="configCustomerType">
          <option value="b2c" ${normalizeProductConfigCustomerType(cfg?.customerType, cfg) === 'b2c' ? 'selected' : ''}>B2C</option>
          <option value="b2b" ${normalizeProductConfigCustomerType(cfg?.customerType, cfg) === 'b2b' ? 'selected' : ''}>B2B</option>
        </select>
      </div>
      <div class="col-md-3">
        <label class="form-label">Sortering</label>
        <input type="number" class="form-control" id="configSortOrder" value="${escapeAttr(cfg?.sortOrder ?? 0)}">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="configIsActive" ${cfg?.isActive === false ? '' : 'checked'}>
          <label class="form-check-label" for="configIsActive">Actief</label>
        </div>
      </div>
      <div class="col-12">
        <label class="form-label">Interne omschrijving</label>
        <textarea class="form-control" id="configDescription" rows="2">${escapeHtml(cfg?.description || '')}</textarea>
      </div>
      <div class="col-lg-7">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="mb-0">Producten</h6>
          <button type="button" class="btn btn-sm btn-outline-primary" id="btnAddConfigItem"><i class="fa-solid fa-plus me-1"></i>Product toevoegen</button>
        </div>
        <div id="configItems">${items.map(configItemRowHtml).join('')}</div>
      </div>
      <div class="col-lg-5">
        <div class="alert alert-light border h-100 mb-0" id="configPreview"></div>
      </div>
    </div>`;
}

function wireConfigForm() {
  const body = document.getElementById('configModalBody');
  body.querySelector('#btnAddConfigItem').addEventListener('click', () => {
    body.querySelector('#configItems').insertAdjacentHTML('beforeend', configItemRowHtml());
    wireConfigFormRows();
    updateConfigPreview();
  });
  ['input', 'change'].forEach(evt => body.addEventListener(evt, updateConfigPreview));
  wireConfigFormRows();
}

function wireConfigFormRows() {
  document.querySelectorAll('#configItems .config-item-remove').forEach(btn => {
    btn.onclick = () => {
      btn.closest('.config-item-row').remove();
      updateConfigPreview();
    };
  });
}

function readConfigForm() {
  const items = Array.from(document.querySelectorAll('#configItems .config-item-row')).map(row => ({
    productId: row.querySelector('.config-item-product').value,
    qty: parseInt(row.querySelector('.config-item-qty').value, 10) || 0,
  })).filter(item => item.productId && item.qty > 0);
  return {
    name: document.getElementById('configName').value.trim(),
    description: document.getElementById('configDescription').value.trim(),
    customerType: normalizeProductConfigCustomerType(document.getElementById('configCustomerType').value),
    sortOrder: parseInt(document.getElementById('configSortOrder').value, 10) || 0,
    isActive: document.getElementById('configIsActive').checked,
    items,
  };
}

function updateConfigPreview() {
  const el = document.getElementById('configPreview');
  if (!el) return;
  const data = readConfigForm();
  const { productsById, categoriesById } = _maps();
  const desc = generatedConfigDescription(data.items, productsById, categoriesById) || 'Nog geen producten gekozen.';
  const subtotal = configSubtotalExVat(data.items, productsById, categoriesById);
  const kg = configBatteryWeightKg(data.items, productsById, categoriesById);
  const bebat = bebatTotalInclVat(kg, currentBebatPricePerKg());
  const readiness = productConfigCalculationReadiness(data, productsById, categoriesById);
  const grid = productConfigGridCompatibility(data, productsById);
  const gridHtml = grid.hasConflict
    ? '<div class="alert alert-danger py-2 small mb-3"><strong>Netconflict:</strong> de gekozen AC-producten hebben geen gemeenschappelijk geschikt nettype.</div>'
    : `<div class="alert alert-light border py-2 small mb-3"><strong>Geschikte nettypes:</strong> ${grid.gridCompatibility.length
      ? grid.gridCompatibility.map(gridConnectionLabel).map(escapeHtml).join(', ')
      : 'nog niet bepaald op de gekozen AC-producten'}</div>`;
  const readinessHtml = readiness.eligible
    ? '<div class="alert alert-success py-2 small mb-3">Deze samenstelling wordt getoond in de calculator-dropdown.</div>'
    : `<div class="alert alert-warning py-2 small mb-3"><strong>Niet in calculator-dropdown</strong><ul class="mb-0 ps-3">${readiness.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>`;
  const warningHtml = readiness.warnings.length
    ? `<div class="alert alert-light border py-2 small mb-3"><strong>Opmerking</strong><ul class="mb-0 ps-3">${readiness.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>`
    : '';
  el.innerHTML = `
    <h6>Preview</h6>
    <div class="small text-muted mb-2">Doelgroep</div>
    <div class="mb-2"><span class="badge ${data.customerType === 'b2b' ? 'text-bg-warning' : 'text-bg-success'}">${data.customerType.toUpperCase()}</span></div>
    ${readinessHtml}${warningHtml}${gridHtml}
    <div class="small text-muted mb-2">Omschrijving</div>
    <div class="mb-3">${escapeHtml(desc)}</div>
    <dl class="row small mb-0">
      <dt class="col-7">Config ex BTW</dt><dd class="col-5 text-end">€${subtotal.toFixed(2)}</dd>
      <dt class="col-7">Batterijgewicht</dt><dd class="col-5 text-end">${kg.toFixed(2)} kg</dd>
      <dt class="col-7">Bebat incl. 21%</dt><dd class="col-5 text-end">€${bebat.toFixed(2)}</dd>
    </dl>`;
}

function currentBebatPricePerKg() {
  const fromInput = parseFloat(document.getElementById('settingsBebatPerKg')?.value);
  if (!isNaN(fromInput) && fromInput > 0) return fromInput;
  const fromSettings = parseFloat(_settings.bebatPricePerKg);
  if (!isNaN(fromSettings) && fromSettings > 0) return fromSettings;
  return 2.89;
}

async function saveConfigFromModal() {
  const data = readConfigForm();
  if (!data.name) { showToast('Vul een configuratienaam in', 'danger'); return; }
  if (!data.items.length) { showToast('Voeg minstens één product toe', 'danger'); return; }
  try {
    if (_editingConfigId) await updateProductConfig(_editingConfigId, data);
    else await createProductConfig(data);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('configModal')).hide();
    await loadConfigs();
    showToast('Configuratie opgeslagen', 'success');
  } catch (e) {
    showToast('Configuratie opslaan mislukt: ' + e.message, 'danger');
  }
}

// ─── QUOTE PREVIEW PROTOTYPE ────────────────────────────────────────────────

async function openQuoteModal(context = {}) {
  const body = document.getElementById('quoteModalBody');
  body.innerHTML = '<p class="text-muted">Laden...</p>';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('quoteModal')).show();
  let projects = [];
  try {
    projects = await listActiveProjects();
  } catch (e) {
    console.warn('Projecten laden voor offerte-preview mislukt', e);
  }
  _quoteProjects = projects || [];
  const hasCustomCalculatorComposition = !context.configId && Array.isArray(context.extraProducts) && context.extraProducts.length > 0;
  _quoteVirtualConfig = hasCustomCalculatorComposition ? {
    id: '__calculator_custom__',
    name: context.customConfigName || 'Samenstelling uit calculator',
    items: [],
    isVirtual: true,
  } : null;
  if (_quoteVirtualConfig) context.configId = _quoteVirtualConfig.id;
  body.innerHTML = buildQuoteModalHtml(projects, context);
  wireQuoteModal();
  updateQuotePreview();
}

function buildQuoteModalHtml(projects, context = {}) {
  const selectedVat = Number(context.vat) === 6 ? 6 : 21;
  const discount = context.discount || {};
  const discountType = discount.type === 'percent' ? 'percent' : 'fixed';
  const discountValue = Number(discount.value) > 0 ? Number(discount.value) : '';
  const extraProductRows = (Array.isArray(context.extraProducts) ? context.extraProducts : [])
    .map(row => quoteExtraProductRowHtml({ ...row, vat: row.vat || selectedVat }))
    .join('');
  const manualRows = (Array.isArray(context.manualLines) ? context.manualLines : [])
    .map(row => quoteManualLineRowHtml({ ...row, vat: row.vat || selectedVat }))
    .join('');
  const quoteConfigs = _quoteVirtualConfig ? [_quoteVirtualConfig, ..._allConfigs] : _allConfigs;
  const configOptions = quoteConfigs.filter(c => c.isActive !== false).map(c => (
    `<option value="${escapeAttr(c.id)}" ${context.configId === c.id ? 'selected' : ''}>${escapeHtml(c.name || '(zonder naam)')}</option>`
  )).join('');
  const projectOptions = (projects || []).map(p => (
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
          <select class="form-select" id="quoteDiscountType" style="max-width:110px">
            <option value="percent" ${discountType === 'percent' ? 'selected' : ''}>%</option>
            <option value="fixed" ${discountType === 'fixed' ? 'selected' : ''}>€</option>
          </select>
          <input type="number" class="form-control" id="quoteDiscountValue" min="0" step="0.01" value="${escapeAttr(discountValue)}" placeholder="Geen">
        </div>
      </div>
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

function buildQuoteComputation() {
  const quoteConfigs = _quoteVirtualConfig ? [_quoteVirtualConfig, ..._allConfigs] : _allConfigs;
  const cfg = quoteConfigs.find(c => c.id === document.getElementById('quoteConfig')?.value);
  if (!cfg) return null;
  const { productsById, categoriesById } = _maps();
  const vat = parseFloat(document.getElementById('quoteVat').value) || 21;
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
  const project = _quoteProjects.find(p => p.id === document.getElementById('quoteProject')?.value) || null;
  return {
    cfg,
    project,
    lines,
    mainRows,
    materialRows,
    miscRows,
    extraRows,
    kg,
    bebatPrice,
    bebatIncl,
    totalProfit,
    totalIncl,
    discountExVat,
  };
}

function updateQuotePreview() {
  const el = document.getElementById('quotePreview');
  if (!el) return;
  const computed = buildQuoteComputation();
  if (!computed) {
    el.innerHTML = '<p class="text-muted mb-0">Kies een configuratie om de offerte-lijnen te bekijken.</p>';
    return;
  }
  const {
    mainRows,
    materialRows,
    miscRows,
    extraRows,
    kg,
    bebatPrice,
    bebatIncl,
    totalProfit,
    totalIncl,
    discountExVat,
  } = computed;
  el.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <thead><tr><th>Omschrijving</th><th class="text-end">Ex BTW</th><th class="text-end">BTW</th><th class="text-end">Incl.</th></tr></thead>
        <tbody>
          ${mainRows}
          ${materialRows}
          ${miscRows}
          ${extraRows}
          <tr>
            <td>Bebat bijdrage (${kg.toFixed(2)} kg × €${bebatPrice.toFixed(2)}/kg)</td>
            <td class="text-end">€${(bebatIncl / 1.21).toFixed(2)}</td>
            <td class="text-end">21%</td>
            <td class="text-end">€${bebatIncl.toFixed(2)}</td>
          </tr>
        </tbody>
        <tfoot><tr><th colspan="3" class="text-end">Totaal incl. BTW</th><th class="text-end">€${totalIncl.toFixed(2)}</th></tr></tfoot>
      </table>
    </div>
    <div class="alert alert-success py-2 mb-2">
      <strong>Totale winst ex BTW:</strong> €${totalProfit.toFixed(2)}
      ${discountExVat > 0 ? `<br><span class="text-muted small">Korting op samenstelling: €${discountExVat.toFixed(2)} ex BTW</span>` : ''}
    </div>
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
  const merged = typeof mergeProjectMetadata === 'function' && project ? mergeProjectMetadata(project) : project;
  const customer = merged && merged.customer ? merged.customer : {};
  const address = billitAddressForCustomer(customer);
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

function billitOfferSubject(configName) {
  return `SmartPeak offerte - ${configName || 'configuratie'}`.slice(0, 250);
}

function buildBillitOfferPayloadForComputed(computed) {
  if (!computed.project) throw new Error('Kies eerst een klant/project voor de Billit-offerte.');
  const customer = projectBillitCustomer(computed.project);
  if (!customer.Name) throw new Error('Het gekozen project heeft geen klantnaam.');
  const title = billitOfferSubject(computed.cfg.name);
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
  const fallbackType = computed?.cfg?.id && !computed?.cfg?.isVirtual ? `PC_${computed.cfg.id}` : '';
  if (computed?.cfg?.isVirtual && explicitType) return explicitType;
  if (explicitType && (!fallbackType || explicitType === fallbackType)) return explicitType;
  return fallbackType;
}

function billitPdfToFile(pdf, orderId) {
  if (!pdf || !pdf.fileContent) throw new Error('Billit gaf geen PDF-bestand terug.');
  const byteChars = atob(pdf.fileContent);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: pdf.mimeType || 'application/pdf' });
  const fileName = pdf.fileName || `billit-offerte-${orderId}.pdf`;
  return new File([blob], fileName, { type: pdf.mimeType || 'application/pdf' });
}

async function attachBillitPdfToProjectConfig(computed, pdf, billitId) {
  const configType = billitConfigTypeForComputed(computed);
  if (!computed?.project?.id || !configType) {
    throw new Error('Kan Billit-offerte niet aan een projectconfig koppelen.');
  }
  const file = billitPdfToFile(pdf, billitId);
  return uploadProjectOfferte(computed.project.id, configType, file, {
    source: 'billit',
    billitOrderId: String(billitId),
    billitFileName: pdf.fileName || file.name,
    productConfigId: computed.cfg.isVirtual ? null : (computed.cfg.id || null),
  });
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
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

function wireProductInteractions() {
  wireProductSectionNav();
  document.getElementById('btnNewProduct').addEventListener('click', () => openNewProduct());
  document.getElementById('productSearch').addEventListener('input', () => renderProductList());
  document.getElementById('toggleShowInactive').addEventListener('change', () => renderProductList());
  document.getElementById('btnNewConfig').addEventListener('click', () => openConfigModal());
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfigFromModal);
  document.getElementById('btnOpenQuoteModal').addEventListener('click', () => openQuoteModal());
}

async function maybeOpenQuoteModalFromUrl() {
  if (_quoteModalOpenedFromUrl) return;
  const context = quoteContextFromSearchParams(new URLSearchParams(window.location.search));
  if (!context) return;
  _quoteModalOpenedFromUrl = true;
  await openQuoteModal(context);
}

// ─── AUTH STATE HANDLING ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Wire sign-in button
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    const errEl = document.getElementById('signInError');
    errEl.classList.add('hide');
    try {
      await signInWithGoogle();
    } catch (e) {
      errEl.textContent = 'Aanmelden mislukt: ' + (e && e.message ? e.message : e);
      errEl.classList.remove('hide');
    }
  });

  document.getElementById('btnSignOut').addEventListener('click', () => signOut());
  document.getElementById('btnSignOutNW').addEventListener('click', () => signOut());

  // Listen for auth state changes
  let _initialized = false;
  onAuthStateChanged(async (user) => {
    if (!user) {
      showState('stateLoggedOut');
      return;
    }
    if (!isWhitelisted(user)) {
      document.getElementById('notWhitelistedEmail').textContent = user.email || '(onbekend)';
      showState('stateNotWhitelisted');
      return;
    }
    document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    showState('stateAuthorized');

    // Only wire event handlers once
    if (!_initialized) {
      _initialized = true;
      wireSettingsCollapse();
      wireToggleButtons();
      wireSaveSettings();
      wireCategoryModal();
      wireProductInteractions();
    }

    // Load data (await both to ensure form is populated before tests check)
    try {
      await loadSettings();
    } catch (e) {
      console.error('loadSettings error:', e);
    }

    try {
      await seedDefaultCategories();
      await loadCategories();
      await loadProducts();
      await loadConfigs();
      await maybeOpenQuoteModalFromUrl();
    } catch (e) {
      console.error('seedDefaultCategories/loadCategories/loadProducts/loadConfigs error:', e);
    }

    // Signal that initialization is complete (used by E2E tests)
    document.getElementById('stateAuthorized').dataset.ready = 'true';
  });
});

