import { extractCsvForStorage } from '../csv.js';
import {
  formatDate, fmt2, fmtEur, renderWithAvg,
  parseSheetConfigs,
  buildAllDaysFromDailyCompact,
  processDataPure,
  validateCalcInputs,
} from '../calc-engine.js';
import { escapeHtml, showSpinner, hideSpinner, withSpinner, showConfirm } from '../shared-helpers.js';
import { makeScenCard } from '../index/scenario-card.js';
import { renderEnergyChart, resetEnergyChartState, wireEnergyChartHandlers } from '../index/energy-chart.js';
import { productConfigsToCalcConfigs } from '../product-config-resolver.js';
import {
  ensureInspectionLine,
  resolveCompositionToCalculatorConfig,
  selectableComposerProducts,
  serializeCompositionLines,
} from '../config-composer.js';

// ─── CSV PARSER ────────────────────────────────────────────────────────────────
// CSV helpers (parseCSV, parseDate, parsVolume) are in assets/js/csv.js
// Formatters, calc-engine, and chart helpers are in assets/js/calc-engine.js

// ─── SAVE / LOAD STATE ────────────────────────────────────────────────────────
let _saved = null; // last renderResults argument, set at render time

// Energy chart rendering lives in assets/js/index/energy-chart.js.
wireEnergyChartHandlers();

function _genMeerkostId() {
  return 'mk_' + Math.random().toString(36).slice(2, 10);
}
function _emptyMeerkostLine() {
  return { id: _genMeerkostId(), description: '', amount: 0 };
}
// btwPercent is the project BTW (6 or 21). Returns sum incl BTW across all lines.
function _sumMeerkostLines(lines, btwPercent) {
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  const factor = 1 + (Number(btwPercent) || 0) / 100;
  return lines.reduce((s, ln) => s + (Number(ln.amount) || 0) * factor, 0);
}
// Pure converter: { [type]: number } → { [type]: MeerkostLine[] }
// Drops entries with amount === 0 or non-positive.
function _migrateMeerkostMapToLines(map) {
  const out = {};
  for (const [type, amount] of Object.entries(map || {})) {
    const a = Number(amount);
    if (Number.isFinite(a) && a > 0) {
      out[type] = [{ id: _genMeerkostId(), description: 'Meerkost', amount: a }];
    }
  }
  return out;
}

function _serializeState() {
  if (!_saved) return null;
  const d = _saved;
  // Strip empty lines (no description AND zero amount) at serialize-time.
  const meerkostLines = {};
  const compositionLines = {};
  (d.configResults || []).forEach(cr => {
    if (!cr.cfg) return;
    if (Array.isArray(cr.cfg.compositionLines)) {
      const keepComposition = serializeCompositionLines(cr.cfg.compositionLines, {
        inspectionProductId: _inspectionProduct && _inspectionProduct.id,
      });
      if (keepComposition.length > 0) compositionLines[cr.cfg.type] = keepComposition;
    }
    if (!Array.isArray(cr.cfg.meerkostLines)) return;
    const keep = cr.cfg.meerkostLines
      .map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amount: Number(ln.amountExBtw != null ? ln.amountExBtw : ln.amount) || 0,
      }))
      .filter(ln => (ln.description && ln.description.trim() !== '') || ln.amount !== 0);
    if (keep.length > 0) meerkostLines[cr.cfg.type] = keep;
  });
  return {
    v: 6,
    form: {
      pvInv:    d.pvInv,
      priceDay: d.priceDay,
      priceNight: (d.dualTariff && !isNaN(d.priceNight)) ? d.priceNight : null,
      selectedConfigTypes: d.configResults.map(cr => cr.cfg.type),
    },
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : null,
    meerkostLines: Object.keys(meerkostLines).length > 0 ? meerkostLines : null,
    compositionLines: Object.keys(compositionLines).length > 0 ? compositionLines : null,
    r: {
      isFullYear: d.isFullYear,
      windowStart: d.windowStart.toISOString().slice(0,10),
      lastDate:    d.lastDate.toISOString().slice(0,10),
      firstDate:   d.firstDate.toISOString().slice(0,10),
      daysInWindow: d.daysInWindow,
      totalDaysCSV: d.allDays.length,
      totalAfname: d.totalAfname, totalInjectie: d.totalInjectie,
      totalAfnamedag: d.totalAfnamedag, totalAfnamenacht: d.totalAfnamenacht,
      totalInjectiedag: d.totalInjectiedag, totalInjectienacht: d.totalInjectienacht,
      dualTariff: d.dualTariff, priceDay: d.priceDay,
      priceNight: d.dualTariff ? d.priceNight : null,
      effectivePrice: d.effectivePrice,
      pvInv: d.pvInv,
      configResults: d.configResults,
      monthMap: d.monthMap,
      eanCode: d.eanCode, meterNr: d.meterNr, meterType: d.meterType,
      capAnalysis: d.capAnalysis,
      numYears:   d.numYears != null ? d.numYears : 1,
      yearsStart: d.yearsStart ? d.yearsStart.toISOString().slice(0,10) : null,
      avgTotals:  d.avgTotals  || null,
      dailyCompact: Array.isArray(d.allDays) ? {
        startDate:     d.allDays[0].date.toISOString().slice(0, 10),
        afname:        d.allDays.map(x => x.afname),
        injectie:      d.allDays.map(x => x.injectie),
        afnamedag:     d.allDays.map(x => x.afnamedag),
        afnamenacht:   d.allDays.map(x => x.afnamenacht),
        injectiedag:   d.allDays.map(x => x.injectiedag),
        injectienacht: d.allDays.map(x => x.injectienacht),
      } : null,
    }
  };
}

function _stateToB64(state) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}
function _b64ToState(b64) {
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}
function _restoreState(r) {
  r.windowStart = new Date(r.windowStart + 'T00:00:00');
  r.lastDate    = new Date(r.lastDate    + 'T00:00:00');
  r.firstDate   = new Date(r.firstDate   + 'T00:00:00');
  if (r.dailyCompact) {
    const dc = r.dailyCompact;
    const start = new Date(dc.startDate + 'T00:00:00');
    // Use dc.afname / dc.injectie as canonical day totals (correct for both single- and dual-tariff data).
    // For single-tariff data, dc.afnamedag / nacht are all 0 — that's expected.
    r.allDays = dc.afname.map((af, i) => {
      const date = new Date(start); date.setDate(date.getDate() + i);
      return {
        date,
        afname: af,
        injectie: dc.injectie[i],
        afnamedag: dc.afnamedag[i],
        afnamenacht: dc.afnamenacht[i],
        injectiedag: dc.injectiedag[i],
        injectienacht: dc.injectienacht[i],
      };
    });
    r.windowDays = r.allDays.filter(d => d.date >= r.windowStart && d.date <= r.lastDate);
  } else {
    // v1-v4 save: per-day data not available. Chart falls back to monthMap-derived views.
    r.allDays = { length: r.totalDaysCSV };
  }
  if (r.priceNight == null) r.priceNight = NaN;
  // Multi-year fields: present in v3, absent in v2/v1.
  if (r.numYears == null)   r.numYears   = 1;
  if (r.yearsStart && typeof r.yearsStart === 'string') r.yearsStart = new Date(r.yearsStart + 'T00:00:00');
  if (r.avgTotals === undefined) r.avgTotals = null;
  return r;
}

async function copyShareLink() {
  const state = _serializeState();
  if (!state) return;
  const urlRow   = document.getElementById('shareUrlRow');
  const urlInput = document.getElementById('shareUrlInput');
  urlRow.style.display = 'none';

  return withSpinner(async () => {
    try {
      const ref = await createShare(state, _projectId || null);
      const url = location.origin + location.pathname + '?s=' + ref.id;
      urlInput.value = url;
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          showToast('🔗 Deellink gekopieerd naar klembord!');
        } catch {
          urlRow.style.display = '';
          urlInput.select();
          showToast('Kopieer de link hieronder handmatig.');
        }
      } else {
        urlRow.style.display = '';
        urlInput.select();
      }
    } catch (e) {
      showToast('❌ Deellink maken mislukt: ' + (e && e.message ? e.message : e));
      throw e;
    }
  }, { message: 'Deellink aanmaken...' });
}

function _compositionMapToMeerkostLines(map) {
  const out = {};
  Object.entries(map || {}).forEach(([type, lines]) => {
    const converted = (lines || [])
      .filter(ln => ln && ln.kind !== 'inspection' && !ln.automatic)
      .map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amount: Number(ln.amountExVat != null ? ln.amountExVat : ln.amount) || 0,
      }))
      .filter(ln => (ln.description && ln.description.trim() !== '') || ln.amount !== 0);
    if (converted.length) out[type] = converted;
  });
  return out;
}

function _applyLoadedState(state, showBanner) {
  if (!state || ![1,2,3,4,5,6].includes(state.v)) { alert('Onbekend of verouderd bestandsformaat.'); return; }
  const f = state.form || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
  set('pvInverter',    f.pvInv);
  set('elecPrice',     f.priceDay);
  set('elecPriceNight',f.priceNight);

  // Restore manual configs if present
  if (state.manualConfigs && typeof state.manualConfigs === 'object') {
    _manualConfigs = { ...state.manualConfigs };
    renderManualConfigCards();
    // Show manual config button when restoring manual configs
    const mcBtn = document.getElementById('addManualConfigBtn');
    if (mcBtn) mcBtn.style.display = '';
  }

  if (state.v >= 2 && f.selectedConfigTypes && f.selectedConfigTypes.some(t => t)) {
    const meerkostLines = (state.v === 6)
      ? (state.meerkostLines || {})
      : _migrateMeerkostMapToLines(state.meerkostMap || {});   // v:5 fallback
    const compositionLines = state.v === 6 ? (state.compositionLines || {}) : {};
    Object.entries(_compositionMapToMeerkostLines(compositionLines)).forEach(([type, lines]) => {
      if (!meerkostLines[type]) meerkostLines[type] = lines;
    });
    loadConfigs().then(() => _populateConfigSelects(f.selectedConfigTypes.filter(t => !isManualConfig(t)), meerkostLines, compositionLines)).catch(() => {});
  }
  const r = _restoreState(state.r);
  if (showBanner) {
    const banner = document.getElementById('loadedBanner');
    banner.innerHTML = `<div class="alert alert-info">
      📥 <div><strong>Geladen vanuit opgeslagen berekening.</strong><br>
      EAN: <strong>${r.eanCode || 'onbekend'}</strong> &nbsp;|&nbsp; Periode: <strong>${formatDate(r.windowStart)} – ${formatDate(r.lastDate)}</strong> &nbsp;|&nbsp; ${r.daysInWindow} dagen<br>
      <span style="font-size:0.85rem;margin-top:4px;display:inline-block;">Upload een nieuwe CSV en klik op <em>Bereken ROI</em> om opnieuw te berekenen met actuele data.</span></div></div>`;
    banner.style.display = '';
  }
  renderResults(r);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── PRODUCT SHEET CONFIG ─────────────────────────────────────────────────────
// CSV URL lives in Firestore `config/products` doc (auth-gated read).
// Fetched via getProductsConfig() in loadConfigs().
let _sheetConfigs = null;
let _sheetProducts = [];
let _sheetCategories = [];
let _settings = {};
let _inspectionProduct = null;
let _compositionLinesByType = {};

// Manual configs — keyed by type ('MANUAL_<timestamp>'). Same resolved shape as sheet configs.
let _manualConfigs = {};

function _getPriceKey() {
  return `${document.getElementById('btwSelect').value}_${document.getElementById('keuringSelect').value}`;
}

function currentBebatPricePerKg() {
  const fromSettings = parseFloat(_settings.bebatPricePerKg);
  if (!isNaN(fromSettings) && fromSettings > 0) return fromSettings;
  return 2.89;
}

// Build all `<option>` HTML for a single picker. `otherSelected` is the list of
// types already picked in the OTHER pickers — those are rendered as disabled.
// `currentValue` is this picker's own current value; it stays selectable so the
// user can change or clear it.
function _buildConfigOptionsHtml(currentValue, otherSelected, isFirst) {
  const priceKey = _getPriceKey();
  const placeholder = isFirst
    ? '<option value="">— Kies een configuratie —</option>'
    : '<option value="">— Geen extra configuratie —</option>';
  const opts = (_sheetConfigs || []).map(c => {
    const disabled = otherSelected.includes(c.type) && c.type !== currentValue ? 'disabled' : '';
    const selected = c.type === currentValue ? 'selected' : '';
    const sourceLabel = c.source === 'productConfig' ? 'Samenstelling' : 'Sheet';
    return `<option value="${c.type}" ${disabled} ${selected}>${sourceLabel}: ${c.type} — ${c.omschrijving} | ${fmt2(c.batCap)} kWh, ${fmt2(c.batInv)} kW | ${fmtEur(c.prices[priceKey])}</option>`;
  }).join('');
  return placeholder + opts;
}

// Read the currently-selected config types, in DOM order, lege filterend weg.
function readSelectedConfigs() {
  return [...document.querySelectorAll('#configPickerList .config-select')]
    .map(s => s.value)
    .filter(v => v);
}

// Read ALL selected configs: sheet picker selections + manual configs.
// Returns array of resolved config objects ready for processDataPure.
function readAllSelectedConfigObjects() {
  const priceKey = _getPriceKey();
  const btwPercent = parseFloat(document.getElementById('btwSelect').value) || 21;
  const lineMap = _readMeerkostLinesFromDom();
  const btwFactor = 1 + btwPercent / 100;

  function resolveLines(rawLines) {
    return (rawLines || [])
      .filter(ln => (ln && ((ln.amount && Number(ln.amount) !== 0) || (ln.description && ln.description.trim() !== ''))))
      .map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amountExBtw: Number(ln.amount) || 0,
        amountInclBtw: (Number(ln.amount) || 0) * btwFactor,
      }));
  }

  function resolveCompositionLinesFor(type) {
    const keuringChoice = document.getElementById('keuringSelect').value;
    const btwPercent = parseFloat(document.getElementById('btwSelect')?.value) || 21;
    const manualLines = serializeCompositionLines(_compositionLinesByType[type] || [], {
      inspectionProductId: _inspectionProduct && _inspectionProduct.id,
    });
    return ensureInspectionLine(manualLines, _inspectionProduct, keuringChoice, btwPercent);
  }

  // Sheet configs from dropdowns
  const sheetTypes = readSelectedConfigs();
  const sheetResolved = sheetTypes
    .map(type => {
      const c = _sheetConfigs.find(x => x.type === type);
      if (!c) return null;
      if (c.source === 'productConfig') {
        return resolveCompositionToCalculatorConfig(c, {
          type,
          baseProductConfigId: c.productConfigId,
          lines: resolveCompositionLinesFor(type),
        }, _sheetProducts, {
          btwPercent,
          categories: _sheetCategories,
          bebatPricePerKg: currentBebatPricePerKg(),
        });
      }
      const basePrice = c.prices[priceKey];
      const lines = resolveLines(lineMap[type]);
      const meerkostTotalInclBtw = lines.reduce((s, l) => s + l.amountInclBtw, 0);
      return {
        type: c.type, omschrijving: c.omschrijving, batCap: c.batCap, batInv: c.batInv, eff: c.eff,
        basePrice,
        price: basePrice + meerkostTotalInclBtw,
        meerkostLines: lines,
        meerkostTotalInclBtw,
      };
    })
    .filter(Boolean);

  // Manual configs (basePrice is the manual all-in price)
  const manualResolved = Object.values(_manualConfigs).map(mc => {
    const lines = resolveLines(lineMap[mc.type]);
    const meerkostTotalInclBtw = lines.reduce((s, l) => s + l.amountInclBtw, 0);
    return {
      type: mc.type,
      omschrijving: `${mc.merk} ${mc.omschrijving}`,
      batCap: mc.batCap, batInv: mc.batInv, eff: mc.eff,
      basePrice: mc.price,
      price: mc.price + meerkostTotalInclBtw,
      meerkostLines: lines,
      meerkostTotalInclBtw,
      isManual: true,
    };
  });

  return [...sheetResolved, ...manualResolved];
}

// Returns { [configType]: MeerkostLine[] } from DOM. Looks at both
// sheet-config picker rows (#configPickerList) and manual-config cards
// (#manualConfigCards). Empty rows (no description + zero amount) are
// dropped at serialize-time, not here — this stays a faithful DOM read
// so live-editing keeps stable ids.
function _readMeerkostLinesFromDom() {
  const out = {};
  function harvest(scope, typeAttr) {
    scope.querySelectorAll(`[${typeAttr}]`).forEach(container => {
      const type = container.getAttribute(typeAttr);
      if (!type) return;
      const rows = container.querySelectorAll('.meerkost-row');
      if (rows.length === 0) return;
      const lines = Array.from(rows).map(r => ({
        id: r.dataset.lineId || _genMeerkostId(),
        description: r.querySelector('.meerkost-desc')?.value || '',
        amount: parseFloat(r.querySelector('.meerkost-amount')?.value) || 0,
      }));
      out[type] = lines;
    });
  }
  const pickerList = document.getElementById('configPickerList');
  if (pickerList) harvest(pickerList, 'data-config-type');
  const manualList = document.getElementById('manualConfigCards');
  if (manualList) harvest(manualList, 'data-config-type');
  return out;
}

// Render N+1 sheet-config pickers. `meerkostLines` is an optional
// { [type]: MeerkostLine[] } map used to seed the disclosure on restore.
// Live DOM lines are preserved across re-renders via _readMeerkostLinesFromDom().
function renderConfigPickers(selectedTypes, meerkostLines, compositionLines) {
  const list = document.getElementById('configPickerList');
  if (!list) return;
  const currentLines = { ..._readMeerkostLinesFromDom(), ...(meerkostLines || {}) };
  if (compositionLines && typeof compositionLines === 'object') {
    _compositionLinesByType = { ..._compositionLinesByType, ...compositionLines };
  }
  const chosen = (selectedTypes || []).filter(v => v);
  list.innerHTML = '';
  for (let i = 0; i <= chosen.length; i++) {
    const currentValue = chosen[i] || '';
    const others = chosen.filter((_, j) => j !== i);
    const row = document.createElement('div');
    row.className = 'config-picker-row';
    if (currentValue) row.dataset.configType = currentValue;
    const isFirst = i === 0;
    const labelTxt = isFirst
      ? 'Configuratie 1 <span style="color:var(--danger);font-size:1rem;">*</span>'
      : `Configuratie ${i + 1} <span style="font-weight:400;text-transform:none;color:var(--muted)">(optioneel)</span>`;
    const linesForRow = (currentValue && currentLines[currentValue]) || [];
    const currentConfig = currentValue ? (_sheetConfigs || []).find(c => c.type === currentValue) : null;
    if (currentConfig && currentConfig.source === 'productConfig' && !_compositionLinesByType[currentValue] && linesForRow.length) {
      _compositionLinesByType[currentValue] = linesForRow.map(ln => ({
        id: ln.id || _genMeerkostId(),
        kind: Number(ln.amount) < 0 ? 'discount' : 'manual',
        description: ln.description || '',
        amountExVat: Number(ln.amount) || 0,
        vat: parseFloat(document.getElementById('btwSelect')?.value) || 21,
      }));
    }
    const adjustmentHtml = !currentValue
      ? ''
      : (currentConfig && currentConfig.source === 'productConfig'
        ? _composerButtonHtml(currentValue, _compositionLinesByType[currentValue] || [])
        : _meerkostDisclosureHtml(linesForRow));
    row.innerHTML = `
      <div class="form-group" style="flex:1;">
        <label>${labelTxt}</label>
        <select class="config-select">${_buildConfigOptionsHtml(currentValue, others, isFirst)}</select>
      </div>
      ${adjustmentHtml}
    `;
    row.querySelector('.config-select').addEventListener('change', () => {
      renderConfigPickers(readSelectedConfigs(), _readMeerkostLinesFromDom());
    });
    _wireMeerkostRow(row);
    list.appendChild(row);
  }
}

// Legacy shim — _applyLoadedState calls this name.
function _populateConfigSelects(selectedTypes, meerkostLines, compositionLines) {
  renderConfigPickers(selectedTypes, meerkostLines, compositionLines);
}

function _composerButtonHtml(type, lines) {
  const savedLines = serializeCompositionLines(lines || [], {
    inspectionProductId: _inspectionProduct && _inspectionProduct.id,
  });
  const productCount = savedLines.filter(ln => ln.kind === 'product').length;
  const manualCount = savedLines.filter(ln => ln.kind === 'manual').length;
  const discountCount = savedLines.filter(ln => ln.kind === 'discount').length;
  const bits = [];
  if (productCount) bits.push(`${productCount} product${productCount === 1 ? '' : 'en'}`);
  if (manualCount) bits.push(`${manualCount} manueel`);
  if (discountCount) bits.push(`${discountCount} korting${discountCount === 1 ? '' : 'en'}`);
  const summary = bits.length ? bits.join(' · ') : 'geen aanpassingen';
  return `
    <div class="composer-summary" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary composer-open-btn" data-composer-type="${escapeHtml(type)}">
        <i class="fa-solid fa-sliders" aria-hidden="true"></i> Samenstelling aanpassen
      </button>
      <span class="meerkost-summary-sum">${escapeHtml(summary)}</span>
    </div>`;
}

function _productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ').trim()
    || product?.description
    || product?.id
    || '(product zonder naam)';
}

function _composerProductOptionsHtml(selectedId) {
  return '<option value="">— Kies product —</option>' + selectableComposerProducts(_sheetProducts, _inspectionProduct && _inspectionProduct.id)
    .map(product => `<option value="${escapeHtml(product.id)}" ${product.id === selectedId ? 'selected' : ''}>${escapeHtml(_productLabel(product))}</option>`)
    .join('');
}

function _composerProductRowHtml(line = {}) {
  return `
    <div class="composer-line composer-product-row" data-line-id="${escapeHtml(line.id || _genMeerkostId())}" style="display:grid;grid-template-columns:minmax(180px,1fr) 90px 90px 44px;gap:8px;align-items:end;margin-bottom:8px;">
      <div class="form-group" style="margin:0;"><label>Product</label><select class="composer-product-id">${_composerProductOptionsHtml(line.productId || '')}</select></div>
      <div class="form-group" style="margin:0;"><label>Aantal</label><input type="number" class="composer-product-qty" min="1" step="1" value="${Number(line.qty) || 1}"></div>
      <div class="form-group" style="margin:0;"><label>BTW</label><select class="composer-product-vat"><option value="6" ${Number(line.vat) === 6 ? 'selected' : ''}>6%</option><option value="21" ${Number(line.vat) !== 6 ? 'selected' : ''}>21%</option></select></div>
      <button type="button" class="btn btn-secondary composer-remove" title="Verwijderen">✕</button>
    </div>`;
}

function _composerManualRowHtml(line = {}) {
  const isDiscount = line.kind === 'discount';
  const amount = Math.abs(Number(line.amountExVat) || 0);
  return `
    <div class="composer-line composer-manual-row" data-line-id="${escapeHtml(line.id || _genMeerkostId())}" style="display:grid;grid-template-columns:135px minmax(180px,1fr) 120px 90px 44px;gap:8px;align-items:end;margin-bottom:8px;">
      <div class="form-group" style="margin:0;"><label>Type</label><select class="composer-manual-kind"><option value="manual" ${!isDiscount ? 'selected' : ''}>Manuele lijn</option><option value="discount" ${isDiscount ? 'selected' : ''}>Korting</option></select></div>
      <div class="form-group" style="margin:0;"><label>Omschrijving</label><input type="text" class="composer-manual-desc" value="${escapeHtml(line.description || '')}" placeholder="Omschrijving"></div>
      <div class="form-group" style="margin:0;"><label>Bedrag ex BTW</label><input type="number" class="composer-manual-amount" min="0" step="0.01" value="${amount || ''}"></div>
      <div class="form-group" style="margin:0;"><label>BTW</label><select class="composer-manual-vat"><option value="6" ${Number(line.vat) === 6 ? 'selected' : ''}>6%</option><option value="21" ${Number(line.vat) !== 6 ? 'selected' : ''}>21%</option></select></div>
      <button type="button" class="btn btn-secondary composer-remove" title="Verwijderen">✕</button>
    </div>`;
}

function _ensureComposerModal() {
  let modal = document.getElementById('configComposerModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'configComposerModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:18px;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="configComposerTitle" style="background:var(--card-bg,#fff);color:var(--text,#111);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:min(980px,100%);max-height:92vh;display:flex;flex-direction:column;">
      <div style="padding:18px 20px;border-bottom:1px solid var(--border,#ddd);display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <h3 id="configComposerTitle" style="margin:0;font-size:1.15rem;">Samenstelling aanpassen</h3>
        <button type="button" class="btn btn-secondary" data-composer-close>Sluiten</button>
      </div>
      <div id="configComposerBody" style="padding:18px 20px;overflow:auto;"></div>
      <div style="padding:14px 20px;border-top:1px solid var(--border,#ddd);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
        <span id="configComposerSummary" class="meerkost-summary-sum"></span>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary" data-composer-close>Annuleren</button>
          <button type="button" class="btn btn-calculate" id="configComposerSave" style="margin:0;">Toepassen</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-composer-close]')) _closeComposerModal();
    if (e.target.closest('#configComposerSave')) _saveComposerModal();
    const removeBtn = e.target.closest('.composer-remove');
    if (removeBtn) {
      removeBtn.closest('.composer-line')?.remove();
      _updateComposerPreview();
    }
    if (e.target.closest('#configComposerAddProduct')) {
      document.getElementById('configComposerProducts')?.insertAdjacentHTML('beforeend', _composerProductRowHtml({ vat: parseFloat(document.getElementById('btwSelect')?.value) || 21 }));
      _updateComposerPreview();
    }
    if (e.target.closest('#configComposerAddManual')) {
      document.getElementById('configComposerManuals')?.insertAdjacentHTML('beforeend', _composerManualRowHtml({ vat: parseFloat(document.getElementById('btwSelect')?.value) || 21 }));
      _updateComposerPreview();
    }
  });
  modal.addEventListener('input', _updateComposerPreview);
  modal.addEventListener('change', _updateComposerPreview);
  return modal;
}

function _openComposerModal(type) {
  const cfg = (_sheetConfigs || []).find(c => c.type === type && c.source === 'productConfig');
  if (!cfg) return;
  const modal = _ensureComposerModal();
  modal.dataset.configType = type;
  const body = modal.querySelector('#configComposerBody');
  const saved = serializeCompositionLines(_compositionLinesByType[type] || [], { inspectionProductId: _inspectionProduct && _inspectionProduct.id });
  const productRows = saved.filter(ln => ln.kind === 'product').map(_composerProductRowHtml).join('');
  const manualRows = saved.filter(ln => ln.kind === 'manual' || ln.kind === 'discount').map(_composerManualRowHtml).join('');
  body.innerHTML = `
    <p style="margin-top:0;color:var(--muted);">Basis: <strong>${escapeHtml(cfg.omschrijving || cfg.type)}</strong>. Keuring wordt automatisch bepaald door de keuring-keuze buiten dit venster en staat hier bewust niet tussen de producten.</p>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 8px;"><h4 style="margin:0;">Extra producten</h4><button type="button" class="btn btn-secondary" id="configComposerAddProduct">+ Product toevoegen</button></div>
    <div id="configComposerProducts">${productRows || ''}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 8px;"><h4 style="margin:0;">Manuele lijnen en kortingen</h4><button type="button" class="btn btn-secondary" id="configComposerAddManual">+ Lijn toevoegen</button></div>
    <div id="configComposerManuals">${manualRows || ''}</div>
    <div id="configComposerPreview" class="alert alert-info" style="margin-top:14px;"></div>`;
  modal.style.display = 'flex';
  _updateComposerPreview();
}

function _closeComposerModal() {
  const modal = document.getElementById('configComposerModal');
  if (modal) modal.style.display = 'none';
}

function _readComposerModalLines() {
  const modal = document.getElementById('configComposerModal');
  if (!modal) return [];
  const productLines = Array.from(modal.querySelectorAll('.composer-product-row')).map(row => {
    const productId = row.querySelector('.composer-product-id')?.value || '';
    const qty = parseInt(row.querySelector('.composer-product-qty')?.value, 10) || 0;
    const vat = parseFloat(row.querySelector('.composer-product-vat')?.value) || 21;
    if (!productId || qty <= 0) return null;
    return { id: row.dataset.lineId || _genMeerkostId(), kind: 'product', productId, qty, vat };
  }).filter(Boolean);
  const manualLines = Array.from(modal.querySelectorAll('.composer-manual-row')).map(row => {
    const kind = row.querySelector('.composer-manual-kind')?.value === 'discount' ? 'discount' : 'manual';
    const description = row.querySelector('.composer-manual-desc')?.value || '';
    const rawAmount = parseFloat(row.querySelector('.composer-manual-amount')?.value) || 0;
    const vat = parseFloat(row.querySelector('.composer-manual-vat')?.value) || 21;
    const amountExVat = kind === 'discount' ? -Math.abs(rawAmount) : rawAmount;
    return { id: row.dataset.lineId || _genMeerkostId(), kind, description, amountExVat, vat };
  });
  return serializeCompositionLines([...productLines, ...manualLines], { inspectionProductId: _inspectionProduct && _inspectionProduct.id });
}

function _updateComposerPreview() {
  const modal = document.getElementById('configComposerModal');
  if (!modal || modal.style.display === 'none') return;
  const type = modal.dataset.configType;
  const cfg = (_sheetConfigs || []).find(c => c.type === type);
  const lines = _readComposerModalLines();
  const btwPercent = parseFloat(document.getElementById('btwSelect')?.value) || 21;
  const withInspection = ensureInspectionLine(lines, _inspectionProduct, document.getElementById('keuringSelect')?.value || 'no', btwPercent);
  const resolved = resolveCompositionToCalculatorConfig(cfg, { type, baseProductConfigId: cfg?.productConfigId, lines: withInspection }, _sheetProducts, {
    btwPercent,
    categories: _sheetCategories,
    bebatPricePerKg: currentBebatPricePerKg(),
  });
  const preview = modal.querySelector('#configComposerPreview');
  const summary = modal.querySelector('#configComposerSummary');
  const adjustableTotal = (resolved?.compositionLines || []).filter(ln => !ln.automatic).reduce((sum, ln) => sum + ln.amountInclBtw, 0);
  const inspection = (resolved?.compositionLines || []).find(ln => ln.kind === 'inspection');
  const html = `Aanpassingen: <strong>${fmtEur(adjustableTotal)}</strong> incl. BTW${inspection ? ` · automatische keuring: <strong>${fmtEur(inspection.amountInclBtw)}</strong>` : ''} · totaal: <strong>${fmtEur(resolved?.price || 0)}</strong>`;
  if (preview) preview.innerHTML = html;
  if (summary) summary.innerHTML = html;
}

function _saveComposerModal() {
  const modal = document.getElementById('configComposerModal');
  const type = modal?.dataset.configType;
  if (!type) return;
  _compositionLinesByType[type] = _readComposerModalLines();
  _closeComposerModal();
  renderConfigPickers(readSelectedConfigs(), _readMeerkostLinesFromDom());
}

// Build the <details> block for one config row. `lines` is the seeded
// MeerkostLine[] (may be empty).
function _meerkostDisclosureHtml(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const btw = parseFloat(document.getElementById('btwSelect')?.value) || 21;
  const sumExBtw = safeLines.reduce((s, ln) => s + (Number(ln.amount) || 0), 0);
  const summaryText = safeLines.length === 0
    ? `Meerprijzen <span class="meerkost-summary-sum">geen</span>`
    : `Meerprijzen (${safeLines.length}) <span class="meerkost-summary-sum">€ ${fmt2(sumExBtw)} ex (BTW ${btw}%)</span>`;
  const isOpen = safeLines.length > 0;
  const rowsHtml = safeLines.map(ln => _meerkostRowHtml(ln)).join('');
  return `
    <details class="meerkost-details" ${isOpen ? 'open' : ''}>
      <summary>${summaryText}</summary>
      <div class="meerkost-lines-list">
        ${rowsHtml}
        <button type="button" class="meerkost-add-btn">+ Regel toevoegen</button>
      </div>
    </details>
  `;
}
function _meerkostRowHtml(line) {
  return `
    <div class="meerkost-row" data-line-id="${escapeHtml(line.id)}">
      <input type="text" class="meerkost-desc" placeholder="Omschrijving" value="${escapeHtml(line.description || '')}">
      <input type="number" class="meerkost-amount" min="0" step="50" value="${Number(line.amount) || 0}">
      <button type="button" class="meerkost-del" title="Verwijder regel">✕</button>
    </div>
  `;
}
// Attach add/delete/input listeners to the meerkost-details inside a row/card.
function _wireMeerkostRow(container) {
  const details = container.querySelector(':scope > .meerkost-details');
  if (!details) return;
  const list = details.querySelector('.meerkost-lines-list');
  const addBtn = details.querySelector('.meerkost-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const newLine = _emptyMeerkostLine();
      addBtn.insertAdjacentHTML('beforebegin', _meerkostRowHtml(newLine));
      _updateMeerkostSummary(details);
    });
  }
  list.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.meerkost-del');
    if (delBtn) {
      delBtn.closest('.meerkost-row')?.remove();
      _updateMeerkostSummary(details);
    }
  });
  list.addEventListener('input', (e) => {
    if (e.target.matches('.meerkost-amount, .meerkost-desc')) {
      _updateMeerkostSummary(details);
    }
  });
  list.addEventListener('blur', (e) => {
    if (e.target.matches('.meerkost-amount')) {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 0) e.target.value = 0;
      _updateMeerkostSummary(details);
    }
  }, true);
}
function _updateMeerkostSummary(detailsEl) {
  const rows = detailsEl.querySelectorAll('.meerkost-row');
  const sum = Array.from(rows).reduce((s, r) => {
    const v = parseFloat(r.querySelector('.meerkost-amount')?.value);
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const btw = parseFloat(document.getElementById('btwSelect')?.value) || 21;
  const summary = detailsEl.querySelector('summary');
  if (!summary) return;
  summary.innerHTML = rows.length === 0
    ? `Meerprijzen <span class="meerkost-summary-sum">geen</span>`
    : `Meerprijzen (${rows.length}) <span class="meerkost-summary-sum">€ ${fmt2(sum)} ex (BTW ${btw}%)</span>`;
}

// ─── MANUAL CONFIG FORM ──────────────────────────────────────────────────────

function _buildManualConfigFormHtml(existing) {
  const e = existing || {};
  return `
    <div class="manual-config-form card" style="padding:16px; margin-top:10px; border:2px solid var(--accent);">
      <h4 style="margin:0 0 12px 0; font-size:1rem;">Manuele configuratie${e.type ? ' bewerken' : ''}</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Merk *</label>
          <input type="text" id="mcfMerk" value="${e.merk || ''}" placeholder="bv. Huawei" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Omschrijving *</label>
          <input type="text" id="mcfOmschrijving" value="${e.omschrijving || ''}" placeholder="bv. Luna 2000 10kWh" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Opslag capaciteit (kWh) *</label>
          <input type="number" id="mcfBatCap" value="${e.batCap || ''}" min="0.1" step="0.01" placeholder="bv. 10" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Omvormer capaciteit (kW) *</label>
          <input type="number" id="mcfBatInv" value="${e.batInv || ''}" min="0.1" step="0.01" placeholder="bv. 5" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Totaalprijs incl. BTW (&euro;) *</label>
          <input type="number" id="mcfPrice" value="${e.price || ''}" min="1" step="1" placeholder="bv. 8500" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>BTW %</label>
          <input type="number" id="mcfBtw" value="${e.btwPercent != null ? e.btwPercent : 21}" min="0" max="100" step="1">
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button type="button" class="btn btn-calculate" data-manual-submit data-edit-type="${escapeHtml(e.type || '')}" style="font-size:0.9rem; padding:6px 16px;">
          ${e.type ? 'Opslaan' : 'Toevoegen'}
        </button>
        <button type="button" class="btn btn-secondary" data-manual-cancel style="font-size:0.9rem; padding:6px 16px;">
          Annuleren
        </button>
      </div>
    </div>
  `;
}

function showManualConfigForm(existingType) {
  const container = document.getElementById('manualConfigFormContainer');
  const existing = existingType ? _manualConfigs[existingType] : null;
  container.innerHTML = _buildManualConfigFormHtml(existing);
  container.style.display = '';
  document.getElementById('addManualConfigBtn').style.display = 'none';
  document.getElementById('mcfMerk').focus();
}

function hideManualConfigForm() {
  const container = document.getElementById('manualConfigFormContainer');
  container.innerHTML = '';
  container.style.display = 'none';
  document.getElementById('addManualConfigBtn').style.display = '';
}

function submitManualConfigForm(editType) {
  const merk         = document.getElementById('mcfMerk').value.trim();
  const omschrijving = document.getElementById('mcfOmschrijving').value.trim();
  const batCap       = parseFloat(document.getElementById('mcfBatCap').value);
  const batInv       = parseFloat(document.getElementById('mcfBatInv').value);
  const price        = parseFloat(document.getElementById('mcfPrice').value);
  const btwPercent   = parseInt(document.getElementById('mcfBtw').value, 10) || 21;

  // Validation
  const errors = [];
  if (!merk) errors.push('Merk is verplicht.');
  if (!omschrijving) errors.push('Omschrijving is verplicht.');
  if (!batCap || batCap <= 0) errors.push('Opslag capaciteit moet > 0 zijn.');
  if (!batInv || batInv <= 0) errors.push('Omvormer capaciteit moet > 0 zijn.');
  if (!price || price <= 0) errors.push('Totaalprijs moet > 0 zijn.');
  if (errors.length) { alert(errors.join('\n')); return; }

  const type = editType || `MANUAL_${Date.now()}`;
  _manualConfigs[type] = {
    type,
    omschrijving,
    merk,
    batCap,
    batInv,
    eff: 0.90,
    price,
    btwPercent,
    isManual: true,
  };

  hideManualConfigForm();
  renderManualConfigCards();
}

function renderManualConfigCards() {
  const container = document.getElementById('manualConfigCards');
  if (!container) return;
  const entries = Object.values(_manualConfigs);
  if (!entries.length) { container.innerHTML = ''; return; }

  // Preserve existing meerkost-lines in DOM before redraw.
  const existingLines = _readMeerkostLinesFromDom();

  container.innerHTML = entries.map(mc => {
    const lines = existingLines[mc.type] || [];
    return `
    <div class="manual-config-card" data-config-type="${escapeHtml(mc.type)}" style="display:flex; flex-direction:column; gap:6px; padding:8px 12px; margin-top:6px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg);">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="background:var(--accent); color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:4px; font-weight:600;">Manueel</span>
        <span style="flex:1; font-size:0.9rem;">
          <strong>${escapeHtml(mc.merk)} ${escapeHtml(mc.omschrijving)}</strong>
          &mdash; ${fmt2(mc.batCap)} kWh / ${fmt2(mc.batInv)} kW &mdash; ${fmtEur(mc.price)}
        </span>
        <button type="button" class="btn btn-secondary" data-manual-edit="${escapeHtml(mc.type)}" style="font-size:0.8rem; padding:3px 8px;" title="Bewerken">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="btn btn-secondary" data-manual-delete="${escapeHtml(mc.type)}" style="font-size:0.8rem; padding:3px 8px; color:var(--danger);" title="Verwijderen">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      ${_meerkostDisclosureHtml(lines)}
    </div>
    `;
  }).join('');

  // Wire each card's disclosure handlers.
  container.querySelectorAll('.manual-config-card').forEach(card => _wireMeerkostRow(card));
}

function editManualConfig(type) {
  showManualConfigForm(type);
}

async function deleteManualConfig(type) {
  const ok = await showConfirm({
    title: 'Manuele configuratie verwijderen?',
    message: `Configuratie "${type}" wordt uit deze berekening verwijderd.`,
    confirmText: 'Verwijderen',
    variant: 'danger',
  });
  if (!ok) return;
  delete _manualConfigs[type];
  renderManualConfigCards();
}

async function loadConfigs() {
  const statusEl = document.getElementById('configsStatus');
  statusEl.innerHTML = '<span class="spinner"></span> Laden...';
  return withSpinner(async () => {
    try {
      const legacyConfigs = [];
      let legacyError = null;
      try {
        const cfg = await getProductsConfig();
        if (!cfg || !cfg.csvUrl) throw new Error('config/products.csvUrl ontbreekt.');
        const resp = await fetch(cfg.csvUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        legacyConfigs.push(...parseSheetConfigs(await resp.text()).map(c => ({ ...c, source: 'sheet' })));
      } catch (e) {
        legacyError = e;
        console.warn('Legacy sheet-configuraties laden mislukt:', e);
      }

      let productCalcConfigs = [];
      let productConfigError = null;
      try {
        const [categories, products, productConfigs, settings] = await Promise.all([
          listProductCategories(),
          listProducts({ isActive: true }),
          listProductConfigs(),
          typeof getSettings === 'function' ? getSettings().catch(() => ({})) : Promise.resolve({}),
        ]);
        _sheetProducts = products;
        _sheetCategories = categories;
        _settings = settings || {};
        _inspectionProduct = products.find(p => p.serviceKey === 'inspection' || p?.specs?.serviceKey === 'inspection') || null;
        productCalcConfigs = productConfigsToCalcConfigs(productConfigs, products, categories);
      } catch (e) {
        productConfigError = e;
        console.warn('Nieuwe samenstellingen laden mislukt:', e);
      }

      _sheetConfigs = [...legacyConfigs, ...productCalcConfigs];
      if (!_sheetConfigs.length) {
        throw productConfigError || legacyError || new Error('Geen configuraties gevonden.');
      }
      _populateConfigSelects();
      document.getElementById('configSelectorsArea').style.display = '';
      document.getElementById('addManualConfigBtn').style.display = '';
      const parts = [];
      if (legacyConfigs.length) parts.push(`${legacyConfigs.length} sheet`);
      if (productCalcConfigs.length) parts.push(`${productCalcConfigs.length} samenstellingen`);
      statusEl.textContent = `✅ ${_sheetConfigs.length} configuraties geladen (${parts.join(' + ')}).`;
    } catch(e) {
      statusEl.textContent = `❌ Fout bij laden: ${e.message}`;
      throw e;
    }
  }, { message: 'Configuraties laden...' });
}

// ─── MAIN CALC ─────────────────────────────────────────────────────────────────
async function calculate() {
  const pvInv      = parseFloat(document.getElementById('pvInverter').value);
  const priceDay   = parseFloat(document.getElementById('elecPrice').value);
  const priceNight = parseFloat(document.getElementById('elecPriceNight').value); // may be NaN

  if (isNaN(pvInv) || isNaN(priceDay)) {
    alert('Vul het ZP-omvormer vermogen en de elektriciteitsprijs in.');
    return;
  }
  if (!_sheetConfigs) {
    alert('Klik eerst op "Configuraties laden" om de productlijst te laden.');
    return;
  }

  const selectedConfigs = readAllSelectedConfigObjects();

  if (!selectedConfigs.length) { alert('Kies minstens één productconfiguratie.'); return; }

  // ── Bounds validation ────────────────────────────────────────────────────
  const validationErrors = validateCalcInputs(pvInv, priceDay, priceNight, selectedConfigs);
  if (validationErrors.length) {
    alert(validationErrors.join('\n'));
    return;
  }

  // ── Guard: confirm before Bereken if removing a config that has an offerte-PDF ──
  if (!(await _confirmConfigCascade(_projectId, selectedConfigs.map(c => c.type)))) return;

  // Show spinner before starting calculation
  showSpinner({ message: 'Berekening uitvoeren...' });

  try {
    // ── Project-mode path: use the project's stored CSV instead of a file upload ──
    if (_projectId && _projectDoc && _projectDoc.csvUpload) {
      const cu = _projectDoc.csvUpload;
      const allDays = buildAllDaysFromDailyCompact(cu.dailyCompact);
      await processDataAsync(
        { allDays, eanCode: cu.eanCode || '', meterNr: cu.meterNr || '', meterType: cu.meterType || '' },
        pvInv, selectedConfigs, priceDay, priceNight
      );
      return;
    }

    // ── Normal path: read CSV from the file input ──
    const fileInput = document.getElementById('csvFile');
    if (!fileInput.files.length) {
      hideSpinner();
      alert('Laad eerst een CSV bestand op.');
      return;
    }

    // Convert FileReader callback to Promise
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Bestand lezen mislukt'));
      reader.readAsText(fileInput.files[0], 'UTF-8');
    });

    await processDataAsync(text, pvInv, selectedConfigs, priceDay, priceNight);
  } catch (err) {
    hideSpinner();
    console.error('Calculate error:', err);
    alert('Berekening mislukt: ' + (err && err.message ? err.message : err));
  }
}

// ─── MAIN CALC ─────────────────────────────────────────────────────────────────
// Multi-year helpers (computePerYearStats, averageStats), CSV parsing (_csvToAllDaysAndMeta),
// and data rebuilding (_buildAllDaysFromDailyCompact) are in assets/js/calc-engine.js

// Async wrapper for processData to allow awaiting the project save
async function processDataAsync(input, pvInv, selectedConfigs, priceDay, priceNight) {
  const d = processDataPure(input, pvInv, selectedConfigs, priceDay, priceNight);
  if (!d) {
    hideSpinner();
    alert('Geen data gevonden in het CSV bestand.');
    return;
  }
  await renderResultsAsync(d);
}


// ── Render helpers (extracted from renderResults for readability) ─────────────

/** Render the period info/warning alert into #periodAlert. */
function renderPeriodAlert(d) {
  let html = '';
  if (!d.isFullYear) {
    html = `<div class="alert alert-warning">
      ⚠️ <div><strong>Geen volledig jaar aan data beschikbaar.</strong><br>
      De beschikbare periode is ${d.daysInWindow} dagen (${formatDate(d.windowStart)} – ${formatDate(d.lastDate)}).
      Jaarlijkse besparingen zijn <em>geëxtrapoleerd</em> op basis van deze kortere periode.</div></div>`;
  } else {
    const avgLine = (d.numYears >= 2 && d.yearsStart)
      ? `<br><span style="font-size:0.88rem;">Gemiddelde berekend over <strong>${d.numYears} volledige jaren</strong> (${formatDate(d.yearsStart)} – ${formatDate(d.lastDate)}).</span>`
      : '';
    html = `<div class="alert alert-info">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i> <div>Berekening op basis van rollend jaar: ${formatDate(d.windowStart)} – ${formatDate(d.lastDate)} (${d.daysInWindow} dagen).${avgLine}</div></div>`;
  }
  document.getElementById('periodAlert').innerHTML = html;
}

/** Render the scenario explanation + optional inverter-mismatch warning into #scenarioAlert. */
function renderScenarioAlert(d) {
  let html = `<div class="alert alert-info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <div>Voor elke configuratie tonen we twee scenario's: <strong>Worst Case</strong> (conservatief — met cap op dagelijkse afname) en <strong>Realistisch</strong> (ideaal — geen beperking). De waarheid ligt ertussen.</div></div>`;
  const anyPvGtBat = d.configResults.some(cr => cr.pvGtBat);
  if (anyPvGtBat) {
    const names = d.configResults
      .map((cr, idx) => cr.pvGtBat ? `Config ${idx+1} (${fmt2(cr.cfg.batInv)} kW)` : null)
      .filter(Boolean).join(', ');
    html += `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i> <div>ZP-omvormer (${d.pvInv} kW) is sterker dan de batterijomvormer bij: ${names}. Bij Worst Case wordt de drempel daarom hoger gezet voor deze configuraties.</div></div>`;
  }
  document.getElementById('scenarioAlert').innerHTML = html;
}

/** Render the energy/meter summary grid into #summaryContent. */
function renderSummaryCard(d) {
  const avgAfname   = d.totalAfname   / (d.daysInWindow || 1);
  const avgInjectie = d.totalInjectie / (d.daysInWindow || 1);
  const totalDaysCSV = d.allDays.length;
  const periodLabel = d.isFullYear ? 'Volledig rollend jaar' : `Gedeeltelijke periode (${d.daysInWindow} dagen)`;
  const a   = d.avgTotals; // shorthand; null when numYears < 2
  const fkw = n => fmt2(n) + ' kWh';
  const fkwd= n => fmt2(n) + ' kWh/dag';

  document.getElementById('summaryContent').innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span class="s-label">EAN-code</span>
        <span class="s-value accent" style="font-size:0.92rem;word-break:break-all;">${d.eanCode || 'onbekend'}</span></div>
      <div class="summary-item"><span class="s-label">Meternummer</span>
        <span class="s-value">${d.meterNr || 'onbekend'}</span></div>
      <div class="summary-item"><span class="s-label">Metertype</span>
        <span class="s-value">${d.meterType || 'onbekend'}</span></div>
      <hr class="summary-divider" />
      <div class="summary-item"><span class="s-label">Volledige CSV periode</span>
        <span class="s-value" style="font-size:0.92rem;">${formatDate(d.firstDate)} – ${formatDate(d.lastDate)}</span></div>
      <div class="summary-item"><span class="s-label">Totaal dagen in CSV</span>
        <span class="s-value">${totalDaysCSV} dagen</span></div>
      <div class="summary-item"><span class="s-label">Berekeningsperiode</span>
        <span class="s-value" style="font-size:0.88rem;">${periodLabel}</span></div>
      <div class="summary-item"><span class="s-label">Van – tot (berekening)</span>
        <span class="s-value" style="font-size:0.92rem;">${formatDate(d.windowStart)} – ${formatDate(d.lastDate)}</span></div>
      <hr class="summary-divider" />
      <div class="summary-item"><span class="s-label">Totale afname (periode)</span>
        <span class="s-value orange">${renderWithAvg(d.totalAfname, a && a.totalAfname, fkw, d.numYears)}</span></div>
      ${d.dualTariff ? `
      <div class="summary-item"><span class="s-label">Afname dag</span>
        <span class="s-value orange">${renderWithAvg(d.totalAfnamedag, a && a.totalAfnamedag, fkw, d.numYears)} <span style="font-size:0.8rem;font-weight:400;color:var(--muted)">(${fmt2(d.totalAfname>0?d.totalAfnamedag/d.totalAfname*100:0)}%)</span></span></div>
      <div class="summary-item"><span class="s-label">Afname nacht</span>
        <span class="s-value orange">${renderWithAvg(d.totalAfnamenacht, a && a.totalAfnamenacht, fkw, d.numYears)} <span style="font-size:0.8rem;font-weight:400;color:var(--muted)">(${fmt2(d.totalAfname>0?d.totalAfnamenacht/d.totalAfname*100:0)}%)</span></span></div>` : ''}
      <div class="summary-item"><span class="s-label">Totale injectie (periode)</span>
        <span class="s-value green">${renderWithAvg(d.totalInjectie, a && a.totalInjectie, fkw, d.numYears)}</span></div>
      ${d.dualTariff ? `
      <div class="summary-item"><span class="s-label">Injectie dag</span>
        <span class="s-value green">${renderWithAvg(d.totalInjectiedag, a && a.totalInjectiedag, fkw, d.numYears)} <span style="font-size:0.8rem;font-weight:400;color:var(--muted)">(${fmt2(d.totalInjectie>0?d.totalInjectiedag/d.totalInjectie*100:0)}%)</span></span></div>
      <div class="summary-item"><span class="s-label">Injectie nacht</span>
        <span class="s-value green">${renderWithAvg(d.totalInjectienacht, a && a.totalInjectienacht, fkw, d.numYears)} <span style="font-size:0.8rem;font-weight:400;color:var(--muted)">(${fmt2(d.totalInjectie>0?d.totalInjectienacht/d.totalInjectie*100:0)}%)</span></span></div>` : ''}
      <div class="summary-item"><span class="s-label">Gem. afname per dag</span>
        <span class="s-value orange">${renderWithAvg(avgAfname, a && a.avgAfnamePerDay, fkwd, d.numYears)}</span></div>
      <div class="summary-item"><span class="s-label">Gem. injectie per dag</span>
        <span class="s-value green">${renderWithAvg(avgInjectie, a && a.avgInjectiePerDay, fkwd, d.numYears)}</span></div>
      ${d.dualTariff ? `<hr class="summary-divider" />
      <div class="summary-item" style="grid-column:1/-1;background:#eef4ff;border-color:var(--primary)">
        <span class="s-label" style="color:var(--primary)">Tweevoudig tarief actief</span>
        <span class="s-value" style="font-size:0.9rem;font-weight:400;">
          Dag: <strong>${fmtEur(d.priceDay)}/kWh</strong> (${fmt2(d.totalAfname>0?d.totalAfnamedag/d.totalAfname*100:0)}% van afname) &nbsp;|&nbsp;
          Nacht: <strong>${fmtEur(d.priceNight)}/kWh</strong> (${fmt2(d.totalAfname>0?d.totalAfnamenacht/d.totalAfname*100:0)}% van afname)<br>
          <span style="color:var(--primary-dark);">→ Gewogen effectieve prijs: <strong>${fmtEur(d.effectivePrice)}/kWh</strong></span>
        </span></div>` : ''}
    </div>`;
  document.getElementById('summaryCard').style.display = '';
}

/** Build the scenario grid HTML (one group header + WC + Opt per config) into #scenariosGrid. */
function renderScenarioGrid(d) {
  let gridHTML = '';
  d.configResults.forEach((cr, idx) => {
    const { cfg, pvGtBat, scenWC, scenOpt } = cr;
    const cfgLabel = cfg.isManual
      ? `${escapeHtml(cfg.omschrijving)} <span style="background:var(--primary);color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;vertical-align:middle;">Manueel</span>`
      : `${escapeHtml(cfg.type)} — ${escapeHtml(cfg.omschrijving)}`;
    const specsBtn = cfg.isManual
      ? ''
      : `<button type="button" class="btn-spec js-product-specs" data-product-type="${escapeHtml(cfg.type)}">📖 Productspecs ↗</button>`;
    gridHTML += `<div style="grid-column:1/-1;">
      <div class="config-group-header">
        🔋 Configuratie ${idx+1}
        <span class="cfg-sub">${cfgLabel}</span>
        <span class="config-specs-badge">${fmt2(cfg.batCap)} kWh &nbsp;·&nbsp; ${fmt2(cfg.batInv)} kW omv. &nbsp;·&nbsp; ${Math.round(cfg.eff*100)}% eff &nbsp;·&nbsp; ${fmtEur(cfg.price)}${cfg.meerkostTotalInclBtw > 0 ? ` <span style="font-size:0.75rem;color:var(--muted);">(incl. ${fmtEur(cfg.meerkostTotalInclBtw)} meerkost)</span>` : ''}</span>
        ${specsBtn}
      </div>
    </div>`;
    const subWC = pvGtBat
      ? `ZP (${d.pvInv} kW) > bat-omv. (${fmt2(cfg.batInv)} kW) — laaddrempel ×${fmt2(d.pvInv/cfg.batInv)}. Verbruikscap toegepast (besparing begrensd door dagelijkse afname).`
      : `Verbruikscap toegepast — besparing begrensd door dagelijkse afname.`;
    gridHTML += makeScenCard(d,
      'Worst Case', '⚠️ Worst Case', 'badge-orange', 'worst-case',
      scenWC, cfg, subWC, 'orange',
      cr.scenWCAvg
    );
    if (scenOpt) {
      const subOpt = pvGtBat
        ? `Zelfde installatie — aanname: batterij laadt volledig (drempel = ${fmt2(cfg.batCap)} kWh) en wordt elke dag volledig verbruikt.`
        : `Aanname: batterij laadt volledig en wordt elke dag volledig verbruikt.`;
      gridHTML += makeScenCard(d,
        'Realistisch', '✨ Realistisch', 'badge-blue', 'optimistic',
        scenOpt, cfg, subOpt, 'blue',
        cr.scenOptAvg
      );
    }
  });
  document.getElementById('scenariosGrid').innerHTML = gridHTML;
}

/** Render the monthly afname/injectie table into #monthlyTable. */
function renderMonthlyTable(d) {
  const months = Object.keys(d.monthMap).sort();
  const showMonthAvg = d.numYears >= 2;
  // Bar scale: include avg values so the marker stays within the visible range.
  const maxInj = Math.max(
    ...months.map(m => d.monthMap[m].injectie),
    ...(showMonthAvg ? months.map(m => d.monthMap[m].avgInjectie || 0) : []),
    1
  );
  let tableHTML = `<table class="data-table"><thead><tr>
    <th>Maand</th>
    <th>Afname (kWh)</th>
    ${d.dualTariff ? '<th>Afname dag</th><th>Afname nacht</th>' : ''}
    <th>Injectie (kWh)</th>
    ${d.dualTariff ? '<th>Injectie dag</th><th>Injectie nacht</th>' : ''}
    <th>Injectie visueel${showMonthAvg ? ` <span class="muted-inline" style="margin-left:0;">(▼ = gem. ${d.numYears} j)</span>` : ''}</th>
  </tr></thead><tbody>`;

  let totAfn=0, totInj2=0, totAfndag=0, totAfnnacht=0, totInjdag=0, totInjnacht=0;
  for (const mk of months) {
    const m = d.monthMap[mk];
    const pct = (m.injectie / maxInj * 100).toFixed(1);
    const avgPct = showMonthAvg && m.avgInjectie != null
      ? Math.min(100, m.avgInjectie / maxInj * 100).toFixed(1)
      : null;
    const markerHTML = avgPct == null ? '' : `<div class="bar-marker" style="left:${avgPct}%" title="gem. ${d.numYears} j: ${fmt2(m.avgInjectie)} kWh"></div>`;
    const [y, mo] = mk.split('-');
    const label = new Date(+y, +mo-1, 1).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' });
    totAfn+=m.afname; totInj2+=m.injectie;
    totAfndag+=(m.afnamedag||0); totAfnnacht+=(m.afnamenacht||0);
    totInjdag+=(m.injectiedag||0); totInjnacht+=(m.injectienacht||0);
    tableHTML += `<tr>
      <td>${label}</td><td>${fmt2(m.afname)}</td>
      ${d.dualTariff ? `<td>${fmt2(m.afnamedag||0)}</td><td>${fmt2(m.afnamenacht||0)}</td>` : ''}
      <td>${fmt2(m.injectie)}</td>
      ${d.dualTariff ? `<td>${fmt2(m.injectiedag||0)}</td><td>${fmt2(m.injectienacht||0)}</td>` : ''}
      <td>
        <div class="bar-container">
          <div class="bar-with-marker" style="min-width:80px;">
            <div class="bar-bg" style="overflow:hidden;">
              <div class="bar-fill green" style="width:${pct}%"></div>
            </div>
            ${markerHTML}
          </div>
          <span style="font-size:0.8rem">${fmt2(m.injectie)}</span>
        </div>
      </td>
    </tr>`;
  }
  tableHTML += `<tr class="highlight">
    <td><strong>Totaal</strong></td><td><strong>${fmt2(totAfn)}</strong></td>
    ${d.dualTariff ? `<td><strong>${fmt2(totAfndag)}</strong></td><td><strong>${fmt2(totAfnnacht)}</strong></td>` : ''}
    <td><strong>${fmt2(totInj2)}</strong></td>
    ${d.dualTariff ? `<td><strong>${fmt2(totInjdag)}</strong></td><td><strong>${fmt2(totInjnacht)}</strong></td>` : ''}
    <td></td>
  </tr></tbody></table>`;
  document.getElementById('monthlyTable').innerHTML = tableHTML;
  document.getElementById('monthlyCard').style.display = '';
  document.getElementById('saveCard').style.display = '';
  document.getElementById('shareUrlRow').style.display = 'none';
}

// ── Main render orchestrator ─────────────────────────────────────────────────

function renderResults(d) {
  _saved = d; // persist for save/share — also read by chart event handlers
  resetEnergyChartState();
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderPeriodAlert(d);
  renderScenarioAlert(d);
  renderSummaryCard(d);
  renderScenarioGrid(d);
  renderCapAnalysis(d.capAnalysis, d.isFullYear, d.daysInWindow, d.numYears);
  renderMonthlyTable(d);
  renderEnergyChart(d);

  // Auto-save to Firestore if we're in project-mode
  if (_projectId && _projectDoc) {
    saveProjectCalcRun(d).catch(err => {
      console.error('Auto-save failed:', err);
      showToast('⚠️ Niet opgeslagen — controleer netwerk');
    });
  }
}

// Async version of renderResults that awaits the project save before completing
async function renderResultsAsync(d) {
  _saved = d;
  resetEnergyChartState();
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Temporarily disable auto-save in renderResults by clearing the project context
  const tempProjectId = _projectId;
  const tempProjectDoc = _projectDoc;
  _projectId = null;
  _projectDoc = null;

  renderResults(d);

  // Restore project context
  _projectId = tempProjectId;
  _projectDoc = tempProjectDoc;

  // Now do the save and wait for it
  if (_projectId && _projectDoc) {
    try {
      await saveProjectCalcRun(d);
    } catch (err) {
      console.error('Auto-save failed:', err);
      showToast('⚠️ Niet opgeslagen — controleer netwerk');
    }
  }

  // Finally hide the spinner
  hideSpinner();
}

// Pre-Bereken confirm when the save would cascade-delete PDFs.
// Returns true if the user confirms (or no PDFs are on the line), false if cancelled.
async function _confirmConfigCascade(projectId, newSelectedTypes) {
  if (!projectId) return true; // no-project mode — no PDFs possible.
  try {
    const snap = await projectDoc(projectId).get();
    const data = snap.data() || {};
    const prevSelected = (data.lastCalcRun && data.lastCalcRun.inputs
                          && Array.isArray(data.lastCalcRun.inputs.selectedConfigTypes))
      ? data.lastCalcRun.inputs.selectedConfigTypes : [];
    const offertes = data.offertes || {};
    const removedWithPdf = prevSelected.filter(t =>
      !newSelectedTypes.includes(t) && offertes[t] && offertes[t].storagePath);
    if (removedWithPdf.length === 0) return true;
    const label = removedWithPdf.join(', ');
    const msg = removedWithPdf.length === 1
      ? `De config "${label}" heeft een offerte-PDF. Als je doorgaat wordt die ook verwijderd.`
      : `De configs "${label}" hebben offerte-PDF's. Als je doorgaat worden die ook verwijderd.`;
    return showConfirm({
      title: 'Configuratie met offerte verwijderen?',
      message: msg,
      confirmText: 'Doorgaan',
      variant: 'danger',
    });
  } catch (e) {
    console.warn('_confirmConfigCascade: snapshot read mislukt, doorgaan zonder confirm', e);
    return true; // fail-open: don't block Bereken on a stale read error.
  }
}

async function saveProjectCalcRun(d) {
  // Build the inputs object from the form (avoid pulling them off d directly — d is the full
  // computed object, inputs are a smaller subset that drives the calc).
  const pvInverter = parseFloat(document.getElementById('pvInverter').value) || 0;
  const priceDay   = parseFloat(document.getElementById('elecPrice').value)  || 0;
  const priceNightRaw = document.getElementById('elecPriceNight').value;
  const priceNight = (priceNightRaw && priceNightRaw.trim() !== '') ? parseFloat(priceNightRaw) : null;
  const selectedConfigTypes = (d.configResults || []).map(cr => cr.cfg && cr.cfg.type).filter(Boolean);

  // Build adjustable lines from configResults.
  const meerkostLines = {};
  const compositionLines = {};
  (d.configResults || []).forEach(cr => {
    if (!cr.cfg) return;
    if (Array.isArray(cr.cfg.compositionLines)) {
      const keepComposition = serializeCompositionLines(cr.cfg.compositionLines, {
        inspectionProductId: _inspectionProduct && _inspectionProduct.id,
      });
      if (keepComposition.length > 0) compositionLines[cr.cfg.type] = keepComposition;
    }
    if (Array.isArray(cr.cfg.meerkostLines) && cr.cfg.meerkostLines.length > 0) {
      const keep = cr.cfg.meerkostLines.map(ln => ({
        id: ln.id || _genMeerkostId(),
        description: ln.description || '',
        amount: Number(ln.amountExBtw != null ? ln.amountExBtw : ln.amount) || 0,
      })).filter(ln => (ln.description && ln.description.trim() !== '') || ln.amount !== 0);
      if (keep.length > 0) meerkostLines[cr.cfg.type] = keep;
    }
  });

  // Build results: same as _serializeState's `r` block, but strip dailyCompact since it lives
  // separately in csvUpload (otherwise we'd duplicate the per-day arrays in Firestore).
  const r = _serializeState();
  if (!r) throw new Error('Geen berekening om op te slaan.');
  const results = { ...r.r };
  delete results.dailyCompact;

  // Sync any fallback-entered metadata back to the project before saving the calc-run.
  try {
    const freshProj = await getProject(_projectId);
    const patch = buildProjectSyncPatch(freshProj);
    if (patch) {
      await updateProjectMetadata(_projectId, patch);
      _projectDoc = await getProject(_projectId);
      showToast('📋 Projectgegevens aangevuld uit invoer');
    }
  } catch (e) {
    console.warn('project sync-back failed', e);
  }

  await saveLastCalcRun(_projectId, {
    inputs: {
      pvInv: pvInverter,
      priceDay,
      priceNight,
      selectedConfigTypes,
      meerkostLines: Object.keys(meerkostLines).length > 0 ? meerkostLines : null,
      compositionLines: Object.keys(compositionLines).length > 0 ? compositionLines : null,
    },
    results,
    manualConfigs: Object.keys(_manualConfigs).length > 0 ? _manualConfigs : null,
  });
  showToast('💾 Opgeslagen in project');
}

// Compare the user-entered form values against the current project. For each field the
// project is missing, copy the form value back to the project patch. Special case for
// pvInverter: creates/updates an inverter entry since solar.inverters is the source.
// Returns the patch (object), or null if nothing to write.
function buildProjectSyncPatch(project) {
  const m = mergeProjectMetadata(project);
  const patch = {};

  // pvInverter: write to solar.inverters[0].powerKw if the project has none.
  if (totalInverterPowerKw(project) === 0) {
    const v = parseFloat(document.getElementById('pvInverter').value);
    if (!isNaN(v) && v > 0) {
      const existing = m.solar.inverters.slice();
      if (existing.length === 0) {
        existing.push({ id: 'inv_' + Math.random().toString(36).slice(2, 10),
                        powerKw: v, brand: null, model: null,
                        panelCount: null, panelPowerWp: null, circuitCount: null, orientation: null });
      } else {
        existing[0] = { ...existing[0], powerKw: v };
      }
      patch.solar = { inverters: existing };
    }
  }

  const supplierPatch = {};
  if (m.supplier.priceDay == null) {
    const v = parseFloat(document.getElementById('elecPrice').value);
    if (!isNaN(v) && v > 0) supplierPatch.priceDay = v;
  }
  if (m.supplier.isSingleTariff !== true && m.supplier.priceNight == null) {
    const v = parseFloat(document.getElementById('elecPriceNight').value);
    if (!isNaN(v) && v > 0) supplierPatch.priceNight = v;
  }
  if (Object.keys(supplierPatch).length > 0) {
    patch.supplier = { ...m.supplier, ...supplierPatch };
  }

  const calcPatch = {};
  // BTW — only if no age-based derivation and no manual default.
  if (effectiveBtwFor(project) == null) {
    const v = document.getElementById('btwSelect').value;
    const n = Number(v);
    if (n === 6 || n === 21) calcPatch.btw = n;
  }
  // Keuring — always: if user value differs from stored calcDefaults, write it.
  const kSel = document.getElementById('keuringSelect').value;
  const kStored = m.calcDefaults.keuring || null;
  if (kSel && kSel !== kStored) calcPatch.keuring = kSel;

  if (Object.keys(calcPatch).length > 0) {
    patch.calcDefaults = { ...m.calcDefaults, ...calcPatch };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function renderCapAnalysis(capAnalysis, isFullYear, daysInWindow, numYears) {
  const card    = document.getElementById('capAnalysisCard');
  const content = document.getElementById('capAnalysisContent');
  card.style.display = '';
  const { rows, maxCap } = capAnalysis;
  const showAvg = numYears >= 2;

  if (!rows.length || (maxCap === null && rows[0] && rows[0].qualDays < 100)) {
    content.innerHTML = `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i> <div>Zelfs de kleinste capaciteit (2,5 kWh) heeft geen 100 dagen met volledige lading. Controleer uw data.</div></div>`;
    return;
  }

  let html = '';
  if (!isFullYear) {
    html += `<div class="alert alert-info" style="margin-bottom:12px;"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <div>Gebaseerd op ${daysInWindow} beschikbare dagen (geen volledig jaar).</div></div>`;
  }
  html += `<div class="alert alert-info" style="margin-bottom:12px;">
    <i class="fa-solid fa-circle-info" aria-hidden="true"></i> <div>Analyse bij <strong>gelijke omvormers</strong> (drempel = capaciteit, geen laadbeperking). Gebruik dit als referentie voor de maximaal zinvolle capaciteit.
    <br><strong style="color:var(--success)">Groen</strong> = ≥ 100 volle laaddagen &nbsp;|&nbsp; <span style="color:var(--warning);font-weight:600">Oranje</span> = &lt; 100 dagen &nbsp;|&nbsp; <span style="background:var(--success);color:#fff;border-radius:4px;padding:1px 6px;font-size:0.78rem;font-weight:700;">MAX</span> = grootste capaciteit met ≥ 100 dagen${showAvg ? ' (gebaseerd op afgelopen jaar)' : ''}</div>
  </div>`;

  html += `<div class="cap-table-wrap"><table class="cap-table">
    <thead><tr><th>Capaciteit (kWh)</th><th style="text-align:center">Volle laaddagen (afgelopen jaar)</th>${showAvg ? `<th style="text-align:center">Gem. ${numYears} j</th>` : ''}</tr></thead><tbody>`;

  for (const r of rows) {
    const isMax    = r.cap === maxCap;
    const isOk     = r.qualDays >= 100;
    const rowClass = isMax ? 'cap-max' : (isOk ? 'cap-ok' : 'cap-fail');
    const badge    = isMax ? '<span class="badge-max">MAX</span>' : '';
    const avgCell  = showAvg ? `<td style="text-align:center;color:var(--muted);font-weight:${isMax?'700':'400'}">${r.avgQualDays != null ? fmt2(r.avgQualDays) : '—'}</td>` : '';
    html += `<tr class="${rowClass}">
      <td>${fmt2(r.cap)} kWh${badge}</td>
      <td style="text-align:center;font-weight:${isMax?'700':'400'}">${r.qualDays}</td>
      ${avgCell}
    </tr>`;
  }
  html += `</tbody></table></div>`;

  if (maxCap !== null) {
    const maxRow = rows.find(r => r.cap === maxCap);
    html += `<div class="alert alert-success" style="margin-top:14px;">
      <i class="fa-solid fa-circle-check icon-ok" aria-hidden="true"></i> <div><strong>Aanbevolen maximale capaciteit: ${fmt2(maxCap)} kWh</strong><br>
      ${maxRow.qualDays} volle laaddagen per (berekenings)jaar.</div></div>`;
  }
  content.innerHTML = html;
}

async function copyShareUrlInput() {
  const input = document.getElementById('shareUrlInput');
  if (!input || !input.value) return;
  input.select();
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('🔗 Gekopieerd!');
      return;
    } catch (_) {
      // Fall back to the legacy selection + execCommand path below.
    }
  }
  document.execCommand('copy');
  showToast('🔗 Gekopieerd!');
}

function wireIndexActions() {
  document.getElementById('loadConfigsBtn')?.addEventListener('click', () => {
    loadConfigs().catch(() => {});
  });
  document.getElementById('addManualConfigBtn')?.addEventListener('click', () => showManualConfigForm());
  document.getElementById('calculateBtn')?.addEventListener('click', () => {
    calculate().catch(() => {});
  });
  document.getElementById('copyShareLinkBtn')?.addEventListener('click', () => {
    copyShareLink().catch(() => {});
  });
  document.getElementById('shareUrlInput')?.addEventListener('click', e => e.currentTarget.select());
  document.getElementById('copyShareUrlBtn')?.addEventListener('click', () => {
    copyShareUrlInput().catch(() => {});
  });
  document.getElementById('configPickerList')?.addEventListener('click', e => {
    const btn = e.target.closest('.composer-open-btn');
    if (!btn) return;
    _openComposerModal(btn.dataset.composerType);
  });
  document.getElementById('manualConfigArea')?.addEventListener('click', e => {
    const submitBtn = e.target.closest('[data-manual-submit]');
    if (submitBtn) {
      submitManualConfigForm(submitBtn.dataset.editType || '');
      return;
    }
    if (e.target.closest('[data-manual-cancel]')) {
      hideManualConfigForm();
      return;
    }
    const editBtn = e.target.closest('[data-manual-edit]');
    if (editBtn) {
      editManualConfig(editBtn.dataset.manualEdit);
      return;
    }
    const deleteBtn = e.target.closest('[data-manual-delete]');
    if (deleteBtn) {
      deleteManualConfig(deleteBtn.dataset.manualDelete);
    }
  });
  document.getElementById('scenariosGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('.js-product-specs');
    if (!btn) return;
    window.open('producten.html?type=' + encodeURIComponent(btn.dataset.productType), '_blank', 'noopener');
  });
}

// ─── AUTO-LOAD FROM URL ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  wireIndexActions();
  // Repopulate dropdowns when BTW/keuring changes
  ['btwSelect','keuringSelect'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (_sheetConfigs) renderConfigPickers(readSelectedConfigs());
    });
  });
  // Auto-load from URL ?data= param (legacy base64 share-link)
  const params = new URLSearchParams(window.location.search);
  const data   = params.get('data');
  if (data) {
    try {
      _applyLoadedState(_b64ToState(data), true);
      engageReadOnly();
    } catch(e) { console.error('Kon opgeslagen staat niet laden vanuit URL:', e); }
  }
  // Auto-load from URL ?s=<id> param (Firestore-backed share)
  const shareId = params.get('s');
  if (shareId) {
    loadShareAndEngageReadOnly(shareId).catch(e => {
      console.error('Kon deellink niet laden:', e);
      const banner = document.getElementById('loadedBanner');
      if (banner) {
        banner.innerHTML = `<div class="alert alert-error"><i class="fa-solid fa-circle-xmark icon-danger" aria-hidden="true"></i> Deellink niet geldig of verwijderd. Neem contact op met je contactpersoon voor een nieuwe link.</div>`;
        banner.style.display = '';
      }
    });
  }
});

async function loadShareAndEngageReadOnly(id) {
  return withSpinner(async () => {
    const share = await getShare(id);
    if (!share || !share.payload) throw new Error('Share niet gevonden');
    _applyLoadedState(share.payload, true);
    engageReadOnly();
  }, { message: 'Deellink laden...' });
}

// Engage read-only mode: called after a ?data=<b64> share-link has been
// successfully restored. Adds the body class that drives the CSS, and
// replaces the loaded-banner content with a clear customer-facing message.
function engageReadOnly() {
  document.body.classList.add('readonly-mode');
  const banner = document.getElementById('loadedBanner');
  if (banner) {
    banner.innerHTML = `
      <div class="alert alert-warning" style="display:flex;gap:10px;align-items:flex-start;">
        🔒
        <div>
          <strong>Gedeelde berekening — alleen-lezen.</strong><br>
          Dit is een voorstel dat je van je contactpersoon ontving.
          Heb je vragen of wil je aanpassingen? Neem contact op met je contactpersoon.
        </div>
      </div>`;
    banner.style.display = '';
  }
}
// ─── PROJECT MODE (?project=<id>) ────────────────────────────────────────────
let _projectId   = null;
let _projectDoc  = null;

(function bootstrapProjectMode() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('project');
  if (!pid) return; // Not project mode — bare or ?data=<b64>, leave everything as-is.
  _projectId = pid;
  // Wait for Firebase + auth before doing anything.
  onAuthStateChanged(async (user) => {
    if (!user || !isWhitelisted(user)) {
      // Redirect to dashboard. Keep the project ID in the URL so dashboard can return to it
      // after sign-in (Phase 2 could implement that; for Phase 1 we just send them to dashboard).
      window.location.href = `dashboard.html`;
      return;
    }
    try {
      await loadProjectIntoUI(pid);
    } catch (e) {
      console.error('Project load error:', e);
      alert('Kon project niet laden: ' + (e && e.message ? e.message : e));
      window.location.href = 'dashboard.html';
    }
  });
})();

// ─── Project values summary card (projectValuesCard) ─────────────────────────
const PROJECT_VOLTAGE_MEASUREMENT_LABELS = {
  l1N: 'L1 - N',
  l2N: 'L2 - N',
  l3N: 'L3 - N',
  l1L2: 'L1 - L2',
  l1L3: 'L1 - L3',
  l2L3: 'L2 - L3',
  l1Pe: 'L1 - PE',
  l2Pe: 'L2 - PE',
  l3Pe: 'L3 - PE',
  nPe: 'N - PE',
};

function fmtProjectDateString(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function renderProjectValuesCard(project) {
  const m = mergeProjectMetadata(project);
  const rows = [];
  function add(label, value) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return;
    rows.push(`<div style="color:var(--muted);">${label}</div><div>${value}</div>`);
  }

  // Leverancier
  if (m.supplier.name) add('Leverancier', escapeHtml(m.supplier.name));
  if (m.supplier.isSingleTariff) {
    if (m.supplier.priceDay != null) add('Tarief (enkelvoudig)', m.supplier.priceDay.toFixed(3) + ' €/kWh');
  } else {
    if (m.supplier.priceDay   != null) add('Dagtarief',   m.supplier.priceDay.toFixed(3)   + ' €/kWh');
    if (m.supplier.priceNight != null) add('Nachttarief', m.supplier.priceNight.toFixed(3) + ' €/kWh');
  }

  // Woning / BTW
  const ageLbl = m.site.houseAgeOver10Years === true  ? '10 jaar of ouder'
             : m.site.houseAgeOver10Years === false ? 'Jonger dan 10 jaar'
             : null;
  if (ageLbl) add('Leeftijd woning', ageLbl);
  const effBtw = effectiveBtwFor(project);
  if (effBtw != null) add('BTW', effBtw + '%');
  if (m.calcDefaults.keuring) add('Keuring (voorkeur)', m.calcDefaults.keuring === 'yes' ? 'Met keuring' : 'Zonder keuring');

  // Planning
  add('Plaatsbezoek ingepland', fmtProjectDateString(m.planning.visitPlannedDate));
  add('Plaatsbezoek uitgevoerd', fmtProjectDateString(m.planning.visitDoneDate));
  add('Installatie ingepland', fmtProjectDateString(m.planning.installationPlannedDate));
  add('Installatie uitgevoerd', fmtProjectDateString(m.planning.installationDoneDate));
  add('Keuring ingepland', fmtProjectDateString(m.planning.inspectionPlannedDate));
  add('Keuring uitgevoerd', fmtProjectDateString(m.planning.inspectionDoneDate));

  // Elektrisch
  if (m.electrical.connectionType) add('Aansluiting', m.electrical.connectionType);
  if (m.electrical.fuseRatingA != null) add('Fluvius-zekering', m.electrical.fuseRatingA + ' A');

  // Zekeringkast
  if (m.cabinet.freeUnits != null) add('Vrije modules in kast', m.cabinet.freeUnits);
  if (m.cabinet.wiringDiameterMm2 != null) add('Bekabeling-diameter', m.cabinet.wiringDiameterMm2 + ' mm²');
  const tri = v => v === true ? 'Ja' : v === false ? 'Nee' : null;
  const triPairs = [
    ['Rem-automaat',                   m.cabinet.hasRemAutomaat],
    ['Stopcontact bij Fluvius',        m.cabinet.hasOutletNearFluvius],
    ['Wifi bij Fluvius',               m.cabinet.hasWifiNearFluvius],
    ['Plaats voor batterijen',         m.cabinet.batteryPlacementRoom],
    ['Wifi bij zekeringkast',          m.cabinet.hasWifiNearCabinet],
  ];
  triPairs.forEach(([label, v]) => { const s = tri(v); if (s) add(label, s); });

  // Technische metingen
  const earthMeasured = tri(m.technical.earthResistanceMeasured);
  if (earthMeasured) add('Aardweerstand gemeten', earthMeasured);
  if (m.technical.earthResistanceOhm != null) add('Aardweerstand', m.technical.earthResistanceOhm + ' Ω');
  add('Meetdatum aardweerstand', fmtProjectDateString(m.technical.earthResistanceMeasuredDate));
  Object.entries(m.technical.voltageMeasurements || {}).forEach(([key, value]) => {
    if (value != null && value !== '') add('Spanning ' + (PROJECT_VOLTAGE_MEASUREMENT_LABELS[key] || key), value + ' V');
  });
  if (m.technical.technicalNotes) add('Technische opmerkingen', escapeHtml(m.technical.technicalNotes));
  if (m.inspection.company) add('Keuringsfirma', escapeHtml(m.inspection.company));
  if (m.inspection.reference) add('Keuring referentie', escapeHtml(m.inspection.reference));

  // Omvormers
  if (m.solar.inverters.length > 0) {
    const total = totalInverterPowerKw(project);
    add('Omvormervermogen totaal', total.toFixed(1) + ' kW');
    add('Aantal omvormers', m.solar.inverters.length);
    const totalPanels = m.solar.inverters.reduce((s, inv) => s + (Number(inv.panelCount) || 0), 0);
    if (totalPanels > 0) add('Aantal zonnepanelen', totalPanels);
  }

  const grid = document.getElementById('pvGrid');
  const card = document.getElementById('projectValuesCard');
  if (rows.length === 0) {
    card.style.display = 'none';
    return;
  }
  grid.innerHTML = rows.join('');
  card.style.display = '';
  card.removeAttribute('open');

  // Wire the edit button (idempotent: remove existing listener by replacing node).
  const btn = document.getElementById('pvEditBtn');
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = 'project-edit.html?project=' + encodeURIComponent(project.id);
  });
}

// Apply project metadata to the calculator form:
//  • Sets field values from project.
//  • Hides fields whose project value is non-null (source-of-truth = project).
//  • Opens the Projectgegevens card with a warning if required calc fields are missing.
// Keuring is ALWAYS visible (user may override per calculation); default only pre-filled.
function applyProjectToCalcForm(project) {
  const m = mergeProjectMetadata(project);
  const hide = (inputId) => {
    const el = document.getElementById(inputId);
    if (el) {
      const group = el.closest('.form-group');
      if (group) group.style.display = 'none';
    }
  };
  const show = (inputId) => {
    const el = document.getElementById(inputId);
    if (el) {
      const group = el.closest('.form-group');
      if (group) group.style.display = '';
    }
  };
  const setVal = (inputId, v) => {
    const el = document.getElementById(inputId);
    if (el && v != null) el.value = v;
  };

  // PV inverter — sum of inverters
  const totalKw = totalInverterPowerKw(project);
  if (totalKw > 0) {
    setVal('pvInverter', totalKw);
    hide('pvInverter');
  } else {
    show('pvInverter');
  }

  // Prijs dag
  if (m.supplier.priceDay != null) {
    setVal('elecPrice', m.supplier.priceDay);
    hide('elecPrice');
  } else {
    show('elecPrice');
  }

  // Prijs nacht — ook verbergen als isSingleTariff true (niet relevant)
  if (m.supplier.isSingleTariff === true) {
    const el = document.getElementById('elecPriceNight');
    if (el) el.value = '';
    hide('elecPriceNight');
  } else if (m.supplier.priceNight != null) {
    setVal('elecPriceNight', m.supplier.priceNight);
    hide('elecPriceNight');
  } else {
    show('elecPriceNight');
  }

  // BTW
  const effBtw = effectiveBtwFor(project);
  if (effBtw != null) {
    setVal('btwSelect', String(effBtw));
    hide('btwSelect');
  } else {
    show('btwSelect');
  }

  // Keuring — NEVER hide; pre-fill with project default if present.
  show('keuringSelect');
  if (m.calcDefaults.keuring) {
    setVal('keuringSelect', m.calcDefaults.keuring);
  }

  // Hide the whole "Installatieparameters" card when all three inputs are hidden.
  const installCard = document.getElementById('installParamsCard');
  if (installCard) {
    const stillVisible = ['pvInverter', 'elecPrice', 'elecPriceNight']
      .map(id => document.getElementById(id))
      .filter(el => el && el.closest('.form-group') && el.closest('.form-group').style.display !== 'none');
    installCard.style.display = stillVisible.length === 0 ? 'none' : '';
  }

  // Required-field warning inside the summary card.
  const missing = [];
  if (!(totalKw > 0))                 missing.push('Omvormervermogen (kW)');
  if (m.supplier.priceDay == null)    missing.push('Dagtarief');
  if (effBtw == null)                 missing.push('BTW');
  const warnEl = document.getElementById('pvIncompleteWarn');
  const card   = document.getElementById('projectValuesCard');
  if (missing.length > 0 && warnEl && card) {
    warnEl.textContent = 'Nog in te vullen vóór Bereken: ' + missing.join(', ') + '. Vul in hieronder of via ✏ Aanpassen.';
    warnEl.style.display = '';
    card.setAttribute('open', '');
  } else if (warnEl) {
    warnEl.style.display = 'none';
  }
}

async function loadProjectIntoUI(id) {
  return withSpinner(async () => {
    const proj = await getProject(id);
    if (!proj || proj.deletedAt) {
      alert('Project niet gevonden of verwijderd.');
      window.location.href = 'dashboard.html';
      return;
    }
    _projectDoc = proj;

    // Hide the regular CSV-upload card — in project-mode the CSV lives in Firestore and is
    // managed via the project banner's "📁 CSV" button (plus the missing-CSV prompt).
    const csvCard = document.getElementById('csvUploadCard');
    if (csvCard) csvCard.style.display = 'none';

    // Render banner
    document.getElementById('pbName').textContent     = getProjectLabel(proj);
    document.getElementById('pbCustomer').textContent = proj.customerName || '—';
    renderProjectStatusChip();
    document.getElementById('projectBanner').style.display = '';
    renderProjectValuesCard(proj);
    applyProjectToCalcForm(proj);

    // If we have CSV + calc data, reuse the v:5 share-link restore path.
    if (proj.csvUpload && proj.lastCalcRun) {
      const restored = buildSavedFromProject(proj);

      // Suppress renderResults' auto-save during the initial restore. The cached
      // configResults may have a pre-v:6 cfg shape (no cfg.meerkostLines), so an
      // auto-save here would write meerkostLines:null and clobber the migration
      // below. Once the user clicks Bereken, the fresh save uses the new shape.
      const _savedProjectDoc = _projectDoc;
      _projectDoc = null;
      _applyLoadedState(restored, /*showBanner*/ false);
      _projectDoc = _savedProjectDoc;

      // One-time write-migration: legacy meerkostMap → meerkostLines on first open
      // in a post-v:6 build. Skipped if already migrated. Failure is non-blocking.
      try {
        const inputs = proj.lastCalcRun.inputs || {};
        if (inputs.meerkostMap && !inputs.meerkostLines) {
          const newLines = _migrateMeerkostMapToLines(inputs.meerkostMap);
          await migrateMeerkostMapToLines(_projectId, newLines);
          _projectDoc = await getProject(_projectId);
        }
      } catch (e) {
        console.warn('meerkost write-migration failed (non-blocking)', e);
      }

      // #results hash (set by dashboard's 💾 button) → scroll to results block.
      if (window.location.hash === '#results') {
        const firstResultCard = document.querySelector('#results .card');
        if (firstResultCard) {
          setTimeout(() => firstResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
      }
    } else if (proj.csvUpload && !proj.lastCalcRun) {
      // CSV present but never calculated — load the form values (if any) but don't auto-render results.
      // User clicks Bereken when ready. If the project carries a pending config seed
      // (e.g. from lead conversion), load configs and preselect it so the picker is ready.
      if (Array.isArray(proj.pendingConfigTypes) && proj.pendingConfigTypes.some(t => t)) {
        loadConfigs().then(() => _populateConfigSelects(proj.pendingConfigTypes.filter(t => !isManualConfig(t)))).catch(() => {});
      }
    } else {
      // No CSV at all — show the upload prompt.
      document.getElementById('projectMissingCsv').style.display = '';
    }
    wireProjectCsvUpload();
  }, { message: 'Project laden...' });
}

function wireProjectCsvUpload() {
  const fileInput = document.getElementById('pbCsvFile');
  const headerBtn = document.getElementById('pbCsvBtn');
  const missingBtn = document.getElementById('missingCsvBtn');

  function triggerFilePicker(replace) {
    fileInput.dataset.replace = replace ? '1' : '0';
    fileInput.value = '';
    fileInput.click();
  }

  headerBtn.addEventListener('click', () => triggerFilePicker(/*replace*/ true));
  if (missingBtn) missingBtn.addEventListener('click', () => triggerFilePicker(/*replace*/ false));

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isReplace = fileInput.dataset.replace === '1' && _projectDoc.csvUpload;
    if (isReplace) {
      const ok = await showConfirm({
        title: 'CSV vervangen?',
        message: 'Vorige CSV en berekening blijven bewaard tot je opnieuw rekent.',
        confirmText: 'Doorgaan',
        variant: 'primary',
      });
      if (!ok) return;
    }

    await withSpinner(async () => {
      try {
        const text = await file.text();
        const csvData = extractCsvForStorage(text);
        await setProjectCsv(_projectId, csvData);
        // Refetch project + re-render
        _projectDoc = await getProject(_projectId);
        document.getElementById('projectMissingCsv').style.display = 'none';
        // Hydrate the saved state with the new CSV but keep the (possibly stale) lastCalcRun.
        if (_projectDoc.lastCalcRun) {
          const restored = buildSavedFromProject(_projectDoc);
          _applyLoadedState(restored, /*showBanner*/ false);
        } else {
          // No prior calc — reset UI to fresh form state.
          // Future: pre-populate eanCode etc. For Phase 1 we simply tell the user to recompute.
          alert('CSV opgeslagen. Vul de form in en klik op Bereken om te rekenen.');
        }
      } catch (err) {
        alert('CSV upload mislukt: ' + (err && err.message ? err.message : err));
        throw err;
      }
    }, { message: 'CSV uploaden...' });
  });
}

function renderProjectStatusChip() {
  const meta = getStatusMeta(_projectDoc.status);
  const el = document.getElementById('pbStatusChip');
  el.innerHTML = `<span class="status-chip" id="pbChip" data-status="${meta.key}" style="background:${meta.color};">${meta.label}</span>`;
  document.getElementById('pbChip').addEventListener('click', (e) => {
    e.stopPropagation();
    openProjectStatusPopover();
  });
}

let _openPbPopover = null;
function closeProjectStatusPopover() {
  if (_openPbPopover) { _openPbPopover.remove(); _openPbPopover = null; }
}
function openProjectStatusPopover() {
  closeProjectStatusPopover();
  const chip = document.getElementById('pbChip');
  const pop = document.createElement('div');
  pop.className = 'status-popover';
  pop.innerHTML = PROJECT_STATUSES.map(s => `
    <div class="status-option" data-status="${s.key}">
      <span class="status-dot" style="background:${s.color}"></span>
      <span>${s.label}</span>
      ${s.key === _projectDoc.status ? '<span style="margin-left:auto;color:var(--muted);"><i class="fa-solid fa-check" aria-hidden="true"></i></span>' : ''}
    </div>
  `).join('');
  document.body.appendChild(pop);
  const rect = chip.getBoundingClientRect();
  pop.style.left = `${rect.left + window.scrollX}px`;
  pop.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  _openPbPopover = pop;
  pop.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newStatus = opt.dataset.status;
      closeProjectStatusPopover();
      if (newStatus === _projectDoc.status) return;
      await withSpinner(async () => {
        try {
          await updateProjectStatus(_projectId, newStatus);
          _projectDoc.status = newStatus;
          renderProjectStatusChip();
        } catch (err) {
          alert('Kon status niet wijzigen: ' + (err && err.message ? err.message : err));
          throw err;
        }
      }, { message: 'Status bijwerken...' });
    });
  });
  setTimeout(() => { document.addEventListener('click', closeProjectStatusPopover, { once: true }); }, 0);
}

// Build a v:5-shaped state object from a project document so we can feed it through
// the existing _applyLoadedState restore-path (which already understands dailyCompact).
function buildSavedFromProject(proj) {
  const r = (proj.lastCalcRun && proj.lastCalcRun.results) ? { ...proj.lastCalcRun.results } : {};
  r.dailyCompact = proj.csvUpload ? proj.csvUpload.dailyCompact : null;
  if (proj.csvUpload) {
    r.eanCode   = proj.csvUpload.eanCode   || r.eanCode;
    r.meterNr   = proj.csvUpload.meterNr   || r.meterNr;
    r.meterType = proj.csvUpload.meterType || r.meterType;
  }
  const inputs = (proj.lastCalcRun && proj.lastCalcRun.inputs) || {};
  // Prefer new shape; fall back to legacy meerkostMap.
  const meerkostLines = (inputs.meerkostLines && Object.keys(inputs.meerkostLines).length > 0)
    ? inputs.meerkostLines
    : (inputs.meerkostMap ? _migrateMeerkostMapToLines(inputs.meerkostMap) : null);
  const compositionLines = (inputs.compositionLines && Object.keys(inputs.compositionLines).length > 0)
    ? inputs.compositionLines
    : null;
  return {
    v: 6,
    form: {
      pvInv: inputs.pvInv,
      priceDay: inputs.priceDay,
      priceNight: inputs.priceNight,
      selectedConfigTypes: inputs.selectedConfigTypes,
    },
    manualConfigs: proj.manualConfigs || {},
    meerkostLines: meerkostLines || null,
    compositionLines,
    r,
  };
}

