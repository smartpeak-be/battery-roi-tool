import { sellPrice, unitPrice } from '../product-pricing.js';
import { specsForCategory } from '../product-specs.js';
import { escapeHtml } from '../shared-helpers.js';
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
    if (s.defaultMarginType) setToggle('marginTypeToggle', s.defaultMarginType);
    if (s.defaultMarginValue != null) document.getElementById('settingsMarginValue').value = s.defaultMarginValue;
    if (s.defaultDiscountType) setToggle('discountTypeToggle', s.defaultDiscountType);
    if (s.defaultDiscountValue != null) document.getElementById('settingsDiscountValue').value = s.defaultDiscountValue;
    if (s.defaultDiscountFromUnit != null) document.getElementById('settingsDiscountFromUnit').value = s.defaultDiscountFromUnit;
    if (s.defaultInstallCost != null) document.getElementById('settingsInstallCost').value = s.defaultInstallCost;
    if (s.defaultInspectCost != null) document.getElementById('settingsInspectCost').value = s.defaultInspectCost;
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
        defaultInstallCost:     parseFloat(document.getElementById('settingsInstallCost').value) || 0,
        defaultInspectCost:     parseFloat(document.getElementById('settingsInspectCost').value) || 0,
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
  const collapsed = localStorage.getItem('smartpeak.settingsCollapsed') !== 'false';
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

// ─── CATEGORY TABS ───────────────────────────────────────────────────────

let _categories = [];
let _activeCategory = null;

async function seedDefaultCategories() {
  const cats = await listProductCategories();
  if (cats.length > 0) return; // Already seeded
  const defaults = [
    { name: 'Thuisbatterij-systemen', slug: 'thuisbatterij-systemen', isDefault: false, sortOrder: 0 },
    { name: 'Batterijen',  slug: 'batterijen',  isDefault: false, sortOrder: 1 },
    { name: 'Omvormers',   slug: 'omvormers',   isDefault: false, sortOrder: 2 },
    { name: 'Materiaal',   slug: 'materiaal',   isDefault: true,  sortOrder: 3 },
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
    html += `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}" data-cat="${escapeAttr(c.id)}">${escapeHtml(c.name)}</button>`;
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
  _categories.forEach((c, i) => {
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
  'Plug & Play': ['Marstek', 'Zendure', 'Growatt', 'EcoFlow', 'Anker Solix', 'Hoymiles', 'Sunpura', 'Bluetti'],
  'Installatie': ['Huawei', 'BYD', 'Dyness', 'Sigenergy', 'Enphase', 'Tesla', 'Sonnen', 'LG', 'Solarwatt', 'Pylontech', 'Alpha ESS', 'SAJ', 'Sungrow', 'Sessy'],
};
const ALL_BRANDS = Object.values(BRAND_OPTIONS).flat();

function getCategorySlug(categoryId) {
  const cat = _categories.find(c => c.id === categoryId);
  return cat ? (cat.slug || cat.name || '').toLowerCase() : '';
}

let _allProducts = [];
let _selectedProductId = null;

async function loadProducts() {
  try {
    _allProducts = await listProducts();
    renderProductList();
  } catch (e) {
    console.error('loadProducts error:', e);
    showToast('Kon producten niet laden: ' + e.message, 'danger');
  }
}

function renderProductList() {
  const list = document.getElementById('productList');
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const showInactive = document.getElementById('toggleShowInactive').checked;

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
    const catName = _categories.find(c => c.id === p.categoryId)?.name || '';
    return `
      <div class="card mb-2 product-card ${inactiveClass} ${activeClass}" data-id="${escapeAttr(p.id)}">
        <div class="card-body py-2 px-3 d-flex align-items-center gap-2">
          <div class="flex-grow-1">
            <strong>${escapeHtml(p.brand)} ${escapeHtml(p.model)}</strong>${badge}
            <div class="text-muted small">${escapeHtml(catName)}${p.description ? ' · ' + escapeHtml(p.description) : ''}</div>
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
    wireDetailForm(desktopBody, product);
  } else {
    // Mobile: render in drawer only
    const drawerBody = document.getElementById('productDrawerBody');
    drawerBody.innerHTML = html;
    wireDetailForm(drawerBody, product);
    document.getElementById('productDrawerTitle').textContent = `${product.brand} ${product.model}`;
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

function buildDetailFormHtml(product, mode) {
  const p = product || {};
  const isCreate = mode === 'create';

  // Get pricing defaults from settings for new products
  const marginType = p.marginType || 'percent';
  const marginValue = p.marginValue ?? 30;
  const discountType = p.discountType || 'percent';
  const discountValue = p.discountValue ?? 10;
  const discountFromUnit = p.discountFromUnit ?? 2;

  const isCustomBrand = p.brand && !ALL_BRANDS.includes(p.brand);

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
        <div class="col-6">
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
          <label class="form-label">Model <span class="text-danger">*</span></label>
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
            <input type="number" class="form-control detail-purchase-price" min="0" step="0.01" value="${escapeAttr(p.purchasePrice || '')}">
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
            <input type="number" class="form-control detail-discount-value" min="0" step="1" value="${escapeAttr(discountValue)}">
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
      <div class="d-flex gap-2 flex-wrap">
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
  const isCreate = !product;

  // Wire brand "Andere" toggle
  const brandSelect = container.querySelector('.detail-brand-select');
  const customBrandGroup = container.querySelector('[data-custom-brand-group]');
  if (brandSelect) {
    brandSelect.addEventListener('change', () => {
      customBrandGroup.classList.toggle('d-none', brandSelect.value !== '__other__');
    });
  }

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
      if (!confirm(`Weet je zeker dat je "${product.brand} ${product.model}" wilt verwijderen? Dit kan niet ongedaan worden.`)) return;
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
      if (!confirm('Foto verwijderen?')) return;
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
    const photos = await listProductPhotos(productId);
    if (!photos.length) { grid.innerHTML = '<span class="text-muted small">Geen foto\'s</span>'; return; }
    grid.innerHTML = productPhotosHtml(photos);
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
      if (!confirm('Datasheet verwijderen?')) return;
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
    const docs = await listProductDatasheets(productId);
    if (!docs.length) { list.innerHTML = '<span class="text-muted small">Geen datasheets</span>'; return; }
    list.innerHTML = productDatasheetsHtml(docs);
  } catch (err) {
    list.innerHTML = '<span class="text-danger small">Fout bij laden datasheets</span>';
    console.error('renderProductDatasheets', err);
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
    html += '<div class="col-6 col-md-4">';
    html += `<label class="form-label small mb-1">${escapeHtml(f.label)}${f.unit ? ' <span class="text-muted">(' + escapeHtml(f.unit) + ')</span>' : ''}</label>`;

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
  if (brand === '__other__') {
    brand = container.querySelector('.detail-custom-brand').value.trim();
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
    categoryId: container.querySelector('.detail-category').value,
    brand,
    model: container.querySelector('.detail-model').value.trim(),
    description: container.querySelector('.detail-description').value.trim(),
    purchasePrice: parseFloat(container.querySelector('.detail-purchase-price').value) || 0,
    marginType: container.querySelector('.detail-margin-type')?.dataset.type || 'percent',
    marginValue: parseFloat(container.querySelector('.detail-margin-value').value) || 0,
    discountType: container.querySelector('.detail-discount-type')?.dataset.type || 'percent',
    discountValue: parseFloat(container.querySelector('.detail-discount-value').value) || 0,
    discountFromUnit: parseInt(container.querySelector('.detail-discount-from-unit').value) || 2,
    specs,
  };
}

function updatePricePreview(container) {
  const data = readProductFromForm(container);
  const pp = data.purchasePrice || 0;
  const sp = sellPrice(data);
  const fromUnit = data.discountFromUnit || 2;
  const kp = unitPrice(data, fromUnit);

  const previewSp = container.querySelector('.detail-preview-sp');
  const previewU2 = container.querySelector('.detail-preview-u2');
  const previewSellPrice = container.querySelector('.detail-preview-sell-price');
  const previewSpWinst = container.querySelector('.detail-preview-sp-winst');
  const previewU2Winst = container.querySelector('.detail-preview-u2-winst');
  const kortingLabel = container.querySelector('.detail-preview-korting-label');

  if (previewSp) previewSp.textContent = pp ? `€${sp.toFixed(2)}` : '—';
  if (previewU2) previewU2.textContent = pp ? `€${kp.toFixed(2)}` : '—';
  if (previewSellPrice) previewSellPrice.value = pp ? sp.toFixed(2) : '—';
  if (previewSpWinst) previewSpWinst.textContent = pp ? `(winst €${(sp - pp).toFixed(2)})` : '';
  if (previewU2Winst) previewU2Winst.textContent = pp ? `(winst €${(kp - pp).toFixed(2)})` : '';
  if (kortingLabel) kortingLabel.textContent = `(vanaf ${fromUnit}e)`;
}

async function saveProductFromForm(container, existingProduct) {
  const data = readProductFromForm(container);

  // Validate
  if (!data.categoryId) { showToast('Kies een categorie', 'danger'); return; }
  if (!data.brand) { showToast('Vul een merk in', 'danger'); return; }
  if (!data.model) { showToast('Vul een model in', 'danger'); return; }
  if (!data.purchasePrice || data.purchasePrice <= 0) { showToast('Vul een aankoopprijs in', 'danger'); return; }

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

function wireProductInteractions() {
  document.getElementById('btnNewProduct').addEventListener('click', () => openNewProduct());
  document.getElementById('productSearch').addEventListener('input', () => renderProductList());
  document.getElementById('toggleShowInactive').addEventListener('change', () => renderProductList());
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
    } catch (e) {
      console.error('seedDefaultCategories/loadCategories/loadProducts error:', e);
    }

    // Signal that initialization is complete (used by E2E tests)
    document.getElementById('stateAuthorized').dataset.ready = 'true';
  });
});

