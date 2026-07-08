// Shared UI for the "Configs & offertes" section + upload modal.
// Used by dashboard.html (inside the project drawer) and project-edit.html
// (as a standalone block on the edit page).
//
// Public API (exposed as globals because the project has no module system):
//   ensureOfferteModal()                                   — inject #offerteModal into <body> once
//   renderOffertesSection(project)                         — returns section HTML
//   wireOffertesClicks(containerEl, getProjectFn, onChange) — delegated click handler
//   openOfferteModal(project, configType, onUploaded)      — show upload modal
//   closeOfferteModal()                                    — hide upload modal
//
// The caller is responsible for:
//   - Including firebase-init.js (uploadProjectOfferte, deleteProjectOfferte,
//     deleteProjectConfig, effectiveBtwFor) before this file.
//   - Providing `escapeHtml(s)` and `showToast(msg, variant)` on the page.
//   - Calling ensureOfferteModal() once during page init.
//   - Re-rendering via `onChange()` (the caller's refresh function) after any mutation.

const OFFERTE_MODAL_HTML = `
  <div class="modal fade" id="offerteModal" tabindex="-1" aria-labelledby="offerteModalTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="offerteModalTitle">Offerte uploaden</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
        </div>
        <div class="modal-body" id="offerteModalBody"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="offerteModalCancel" data-bs-dismiss="modal">Annuleren</button>
        </div>
      </div>
    </div>
  </div>
`;


function ensureOfferteModal() {
  if (document.getElementById('offerteModal')) return;
  document.body.insertAdjacentHTML('beforeend', OFFERTE_MODAL_HTML);
}

function _findConfigByType(project, configType) {
  const results = project.lastCalcRun && project.lastCalcRun.results;
  const inputs = project.lastCalcRun && project.lastCalcRun.inputs;
  const cfgResults = results && Array.isArray(results.configResults) ? results.configResults : [];
  const match = cfgResults.find(cr => cr.cfg && cr.cfg.type === configType);
  const storedName = inputs && inputs.compositionNames && inputs.compositionNames[configType];
  const cfg = match ? match.cfg : { type: configType, omschrijving: storedName || '' };
  const priceKey = _getProjectPriceKey(project);
  const priceEur = cfg.price || (cfg.prices && cfg.prices[priceKey]) || 0;
  return {
    type:        cfg.type || configType,
    omschrijving:cfg.omschrijving || storedName || '',
    batCap:      cfg.batCap || null,
    batInv:      cfg.batInv || null,
    priceEur,
    productConfigId: cfg.productConfigId || (cfg.composition && cfg.composition.baseProductConfigId) || ''
  };
}

function _getProjectPriceKey(project) {
  const btw     = (typeof effectiveBtwFor === 'function') ? effectiveBtwFor(project) : 21;
  const keuring = (project.calcDefaults && project.calcDefaults.inspectieGekozen === true) ? 'yes' : 'no';
  return `${btw}_${keuring}`;
}

function _formatEuros(v) {
  return Number(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _formatEuros2(v) {
  return Number(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _sumBillitInvoiceAmountExVat(offerMeta) {
  const invoices = offerMeta && Array.isArray(offerMeta.billitInvoices) ? offerMeta.billitInvoices : [];
  return invoices.reduce((sum, inv) => sum + Number(inv.amountExVat || 0), 0);
}

async function _recordBillitInvoiceForConfig(projectId, configType, invoiceMeta) {
  if (!projectId || !configType || !invoiceMeta) return;
  const now = firebase.firestore.FieldValue.serverTimestamp();
  await firebase.firestore().collection('projects').doc(projectId).update(
    new firebase.firestore.FieldPath('offertes', configType, 'billitInvoices'), firebase.firestore.FieldValue.arrayUnion(invoiceMeta),
    'updatedAt', now,
  );
}

async function _setBillitInvoicePaidForConfig(projectId, configType, invoiceId, paid) {
  if (!projectId || !configType || !invoiceId) return;
  const ref = firebase.firestore().collection('projects').doc(projectId);
  await firebase.firestore().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const data = snap.exists ? snap.data() : {};
    const meta = data.offertes && data.offertes[configType] ? data.offertes[configType] : {};
    const invoices = Array.isArray(meta.billitInvoices) ? meta.billitInvoices : [];
    const next = invoices.map(inv => String(inv.invoiceId || '') === String(invoiceId)
      ? { ...inv, paid: !!paid, paidAt: paid ? new Date().toISOString() : null }
      : inv);
    txn.update(ref,
      new firebase.firestore.FieldPath('offertes', configType, 'billitInvoices'), next,
      'updatedAt', firebase.firestore.FieldValue.serverTimestamp(),
    );
  });
}

function _serialNumbersForInvoice(project) {
  return (Array.isArray(project && project.serialNumbers) ? project.serialNumbers : [])
    .map(s => ({
      value: String((s && (s.value || s.serial || s.serialNumber || s.number)) || '').trim(),
      category: String((s && (s.categoryLabel || s.category || s.type)) || '').trim(),
    }))
    .filter(s => s.value);
}

function _serialNumbersLabel(serials) {
  if (!serials.length) return 'Geen serienummers gevonden op dit project.';
  return serials.map(s => `${s.category ? `${s.category}: ` : ''}${s.value}`).join(', ');
}

function _formatOfferteDate(d) {
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Inner content only — active configs grid.
// Returns '' when the project has no configs to display.
// Used by dashboard.html (wrapped in a <section>) and project-edit.html (wrapped in a .card).
function renderOffertesCards(project) {
  const types = (project.lastCalcRun && project.lastCalcRun.inputs && Array.isArray(project.lastCalcRun.inputs.selectedConfigTypes))
    ? project.lastCalcRun.inputs.selectedConfigTypes : [];
  const offertes  = project.offertes || {};
  const active = types;
  if (active.length === 0) return '';

  const activeCards = active.map(t => {
    const cfg = _findConfigByType(project, t);
    const pdf = offertes[t];
    const iconState = pdf
      ? '<span role="img" aria-label="Offerte aanwezig"><i class="fa-solid fa-circle-check icon-ok" aria-hidden="true"></i></span>'
      : '<span role="img" aria-label="Offerte ontbreekt"><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i></span>';
    const fileRow = pdf
      ? `<div class="offerte-row-pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ${escapeHtml(pdf.filename || '')}</div>`
      : `<div class="offerte-row-pdf" style="color:var(--sp-muted);">Nog geen offerte</div>`;
    const invoicedExVat = _sumBillitInvoiceAmountExVat(pdf);
    const invoiceCount = pdf && Array.isArray(pdf.billitInvoices) ? pdf.billitInvoices.length : 0;
    const paidCount = pdf && Array.isArray(pdf.billitInvoices) ? pdf.billitInvoices.filter(inv => inv.paid).length : 0;
    const invoiceSummary = invoiceCount
      ? `<div class="offerte-row-pdf text-muted"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> ${invoiceCount} factuur${invoiceCount === 1 ? '' : 'en'} · € ${_formatEuros2(invoicedExVat)} ex. · ${paidCount}/${invoiceCount} betaald</div>`
      : '';
    const isManual = typeof window.isManualConfig === 'function' && window.isManualConfig(t);
    const isProductConfig = typeof window.isProductConfig === 'function' && window.isProductConfig(t);
    const isCustomCalculatorConfig = typeof t === 'string' && t.startsWith('CUSTOM_');
    const canCreateOffer = !isManual && (cfg.productConfigId || isProductConfig || isCustomCalculatorConfig);
    const createOfferAction = canCreateOffer
      ? `<button class="btn btn-sm btn-outline-success offerte-create-btn" data-offerte-action data-type="${escapeHtml(t)}" title="Omzetten naar Billit-offerte" aria-label="Omzetten naar Billit-offerte"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i></button>`
      : '';
    const createInvoiceAction = pdf && pdf.billitOrderId
      ? `<button class="btn btn-sm btn-outline-primary offerte-invoice-btn" data-offerte-action data-type="${escapeHtml(t)}" title="Factuur maken" aria-label="Factuur maken"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></button>`
      : '';
    const actions = pdf
      ? `<button class="btn btn-sm btn-outline-secondary offerte-download-btn" data-offerte-action data-type="${escapeHtml(t)}" title="Download PDF" aria-label="Download PDF"><i class="fa-solid fa-download" aria-hidden="true"></i></button>
         <button class="btn btn-sm btn-outline-secondary offerte-replace-btn"  data-offerte-action data-type="${escapeHtml(t)}" title="Vervang PDF" aria-label="Vervang PDF"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>
         <button class="btn btn-sm btn-outline-warning   offerte-deletepdf-btn" data-offerte-action data-type="${escapeHtml(t)}" title="Alleen PDF verwijderen" aria-label="Alleen PDF verwijderen"><i class="fa-solid fa-file-circle-xmark" aria-hidden="true"></i></button>
         ${createOfferAction}
         ${createInvoiceAction}
         <button class="btn btn-sm btn-outline-danger    offerte-trash-btn"     data-offerte-action data-type="${escapeHtml(t)}" title="Config verwijderen" aria-label="Config verwijderen"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`
      : `<button class="btn btn-sm btn-outline-primary offerte-upload-btn"     data-offerte-action data-type="${escapeHtml(t)}" title="Upload offerte" aria-label="Upload offerte"><i class="fa-solid fa-upload" aria-hidden="true"></i></button>
         ${createOfferAction}
         <button class="btn btn-sm btn-outline-danger  offerte-trash-btn"      data-offerte-action data-type="${escapeHtml(t)}" title="Config verwijderen" aria-label="Config verwijderen"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;

    const displayName = cfg.omschrijving || cfg.type;
    const titleLabel = isManual
      ? `<span class="badge bg-primary" style="font-size:0.65rem; vertical-align:middle; margin-right:4px;">Manueel</span>${escapeHtml(displayName)}`
      : isCustomCalculatorConfig
        ? escapeHtml(displayName)
        : escapeHtml(cfg.type);
    const descriptionLabel = isManual
      ? ''
      : isCustomCalculatorConfig
        ? (cfg.type && cfg.type !== displayName ? cfg.type : '')
        : (cfg.omschrijving || '');

    return `
      <div class="col">
        <div class="offerte-row h-100 ${pdf ? 'has-pdf' : 'missing-pdf'}">
          <div class="offerte-row-head">
            ${iconState}
            <span class="offerte-row-title">${titleLabel}</span>
          </div>
          <div class="offerte-row-desc">${escapeHtml(descriptionLabel)}</div>
          <div class="offerte-row-meta">
            € ${_formatEuros(cfg.priceEur)}${cfg.batCap ? ' · ' + escapeHtml(String(cfg.batCap)) + ' kWh' : ''}${cfg.batInv ? ' · ' + escapeHtml(String(cfg.batInv)) + ' kW' : ''}
          </div>
          ${fileRow}
          ${invoiceSummary}
          <div class="offerte-row-actions">${actions}</div>
        </div>
      </div>
    `;
  }).join('');

  return activeCards
    ? `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">${activeCards}</div>`
    : '';
}

// Section-wrapped variant for the dashboard drawer.
function renderOffertesSection(project) {
  const inner = renderOffertesCards(project);
  if (!inner) return '';
  return `
    <section class="border-bottom pb-3 mb-3 drawer-configs">
      <h6 class="mb-2 text-uppercase text-muted">Configs &amp; offertes</h6>
      ${inner}
    </section>
  `;
}

function wireOffertesClicks(containerEl, getProjectFn, onChange) {
  if (!containerEl || containerEl._offertesWired) return;
  containerEl._offertesWired = true;
  containerEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-offerte-action]');
    if (!btn) return;
    const type = btn.getAttribute('data-type');
    const project = getProjectFn();
    if (!project || !project.id || !type) return;

    try {
      if (btn.classList.contains('offerte-upload-btn') || btn.classList.contains('offerte-replace-btn')) {
        openOfferteModal(project, type, onChange);
      }
      else if (btn.classList.contains('offerte-create-btn')) {
        const existingOffer = project.offertes && project.offertes[type];
        if (existingOffer && existingOffer.billitOrderId) {
          const ok = await showConfirm({
            title: 'Nieuwe Billit-offerte maken?',
            message: `Er hangt al een Billit-offerte (#${existingOffer.billitOrderId}) aan deze config. Als je doorgaat wordt die vorige offerte eerst geweigerd en daarna wordt een nieuwe offerte aangemaakt.`,
            confirmText: 'Vorige weigeren + nieuwe maken',
            variant: 'warning',
          });
          if (!ok) return;
        }
        const quoteTools = window.SmartPeakQuoteContext;
        if (!quoteTools || typeof quoteTools.buildQuoteContextFromProjectConfig !== 'function') {
          throw new Error('Offerte-context is nog niet geladen. Herlaad de pagina en probeer opnieuw.');
        }
        if (!window.SmartPeakQuotePreview || typeof window.SmartPeakQuotePreview.openQuoteModal !== 'function') {
          throw new Error('Offerte-preview is nog niet geladen. Herlaad de pagina en probeer opnieuw.');
        }
        const context = quoteTools.buildQuoteContextFromProjectConfig(project, type, {
          vat: (typeof effectiveBtwFor === 'function') ? effectiveBtwFor(project) : 21,
        });
        if (!context.configId && (!Array.isArray(context.extraProducts) || context.extraProducts.length === 0)) {
          throw new Error('Deze configuratie bevat geen productlijnen voor de offerte-preview.');
        }
        window.SmartPeakQuotePreview.openQuoteModal(context, {
          onBillitPdfAttached: () => onChange && onChange(),
        });
      }
      else if (btn.classList.contains('offerte-invoice-btn')) {
        openBillitInvoiceModal(project, type, onChange);
      }
      else if (btn.classList.contains('offerte-download-btn')) {
        const pdf = (project.offertes || {})[type];
        if (!pdf || !pdf.storagePath) return;
        showSpinner();
        try {
          const url = await firebase.storage().ref(pdf.storagePath).getDownloadURL();
          window.open(url, '_blank');
        } finally {
          hideSpinner();
        }
      }
      else if (btn.classList.contains('offerte-deletepdf-btn')) {
        const ok = await showConfirm({
          title: 'Offerte-PDF verwijderen?',
          message: 'De configuratie zelf blijft behouden.',
          confirmText: 'PDF verwijderen',
          variant: 'danger',
        });
        if (!ok) return;
        showSpinner();
        try {
          await deleteProjectOfferte(project.id, type);
          if (typeof onChange === 'function') await onChange();
        } finally {
          hideSpinner();
        }
      }
      else if (btn.classList.contains('offerte-trash-btn')) {
        const pdf = (project.offertes || {})[type];
        const ok = await showConfirm({
          title: 'Configuratie verwijderen?',
          message: pdf && pdf.storagePath
            ? `Config "${type}" en de gekoppelde offerte-PDF worden verwijderd. Dit kan niet ongedaan worden.`
            : `Config "${type}" wordt verwijderd. Dit kan niet ongedaan worden.`,
          confirmText: 'Config verwijderen',
          variant: 'danger',
        });
        if (!ok) return;
        showSpinner();
        try {
          await deleteProjectConfig(project.id, type);
          if (typeof onChange === 'function') await onChange();
        } finally {
          hideSpinner();
        }
      }
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('Er ging iets mis: ' + (err.message || err), 'danger');
      } else {
        console.error(err);
      }
    }
  });
}

function _billitPdfToFile(pdf, orderId) {
  if (!pdf || !pdf.fileContent) throw new Error('Billit gaf geen PDF-bestand terug.');
  const byteChars = atob(pdf.fileContent);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: pdf.mimeType || 'application/pdf' });
  const fileName = pdf.fileName || `billit-factuur-${orderId}.pdf`;
  return new File([blob], fileName, { type: pdf.mimeType || 'application/pdf' });
}

async function _waitForBillitPdf(endpoint, token, orderId, statusEl) {
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

function openBillitInvoiceModal(project, configType, onChange) {
  ensureOfferteModal();
  const body = document.getElementById('offerteModalBody');
  const title = document.getElementById('offerteModalTitle');
  const pdf = (project.offertes || {})[configType];
  if (!pdf || !pdf.billitOrderId) throw new Error('Deze config heeft nog geen gekoppelde Billit-offerte.');
  const cfg = _findConfigByType(project, configType);
  const btw = (typeof effectiveBtwFor === 'function') ? effectiveBtwFor(project) : 21;
  const totalExVat = Number((Number(cfg.priceEur || 0) / (1 + btw / 100)).toFixed(2));
  const alreadyInvoicedExVat = Number(_sumBillitInvoiceAmountExVat(pdf).toFixed(2));
  const openExVat = Math.max(0, Number((totalExVat - alreadyInvoicedExVat).toFixed(2)));
  const serials = _serialNumbersForInvoice(project);
  const invoiceRows = Array.isArray(pdf.billitInvoices) && pdf.billitInvoices.length
    ? pdf.billitInvoices.map(inv => `<div class="d-flex justify-content-between align-items-center gap-2 py-1 border-bottom">
        <span>${escapeHtml(inv.kind === 'final' ? 'Afrekening' : 'Voorschot')} #${escapeHtml(inv.invoiceId || '')}</span>
        <span class="ms-auto">€ ${_formatEuros2(inv.amountExVat)} ex.</span>
        <button type="button" class="btn btn-sm ${inv.paid ? 'btn-success' : 'btn-outline-secondary'}" data-billit-paid-toggle data-invoice-id="${escapeHtml(inv.invoiceId || '')}" data-paid="${inv.paid ? '1' : '0'}">
          ${inv.paid ? 'Betaald' : 'Open'}
        </button>
      </div>`).join('')
    : '<div class="text-muted">Nog geen facturen geregistreerd.</div>';
  title.textContent = 'Factuur maken';
  document.querySelector('#offerteModal .modal-footer')?.classList.add('d-none');
  body.innerHTML = `
    <form id="billitInvoiceForm" class="vstack gap-3">
      <div>
        <div class="fw-semibold">${escapeHtml(cfg.omschrijving || cfg.type || configType)}</div>
        <div class="text-muted small">Gebaseerd op Billit-offerte #${escapeHtml(pdf.billitOrderId)}</div>
      </div>
      <div class="border rounded p-2 bg-light small">
        <div class="d-flex justify-content-between"><span>Totaal offerte</span><strong>€ ${_formatEuros2(totalExVat)} ex.</strong></div>
        <div class="d-flex justify-content-between"><span>Reeds gefactureerd</span><strong>€ ${_formatEuros2(alreadyInvoicedExVat)} ex.</strong></div>
        <div class="d-flex justify-content-between"><span>Openstaand</span><strong>€ ${_formatEuros2(openExVat)} ex.</strong></div>
        <hr class="my-2">
        ${invoiceRows}
      </div>
      <div class="border rounded p-2">
        <label class="form-check mb-2">
          <input class="form-check-input" type="radio" name="invoiceKind" value="advance" checked>
          <span class="form-check-label fw-semibold">Voorschotfactuur</span>
        </label>
        <div class="input-group input-group-sm ms-4" style="max-width:220px;">
          <input type="number" min="1" max="100" step="1" class="form-control" id="billitAdvancePct" value="30">
          <span class="input-group-text">%</span>
        </div>
      </div>
      <div class="border rounded p-2">
        <label class="form-check mb-2">
          <input class="form-check-input" type="radio" name="invoiceKind" value="final">
          <span class="form-check-label fw-semibold">Afrekening</span>
        </label>
        <label class="form-label small ms-4 mb-1" for="billitFinalAmountExVat">Openstaand bedrag ex. BTW</label>
        <div class="input-group input-group-sm ms-4" style="max-width:260px;">
          <span class="input-group-text">€</span>
          <input type="number" min="0.01" step="0.01" class="form-control" id="billitFinalAmountExVat" value="${escapeHtml(openExVat || '')}">
        </div>
        <div class="form-text ms-4">Aanpasbaar indien er al een voorschot betaald/gefactureerd is.</div>
      </div>
      <div class="border rounded p-2">
        <label class="form-check mb-2">
          <input class="form-check-input" type="checkbox" id="billitIncludeSerials" ${serials.length ? '' : 'disabled'}>
          <span class="form-check-label fw-semibold">Serienummers vermelden op factuur</span>
        </label>
        <div class="small text-muted ms-4">${escapeHtml(_serialNumbersLabel(serials))}</div>
      </div>
      <div class="small text-muted" id="billitInvoiceStatus"></div>
      <div class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuleren</button>
        <button type="submit" class="btn btn-primary" id="billitInvoiceSubmit"><i class="fa-solid fa-file-invoice-dollar me-1"></i> Factuur maken</button>
      </div>
    </form>`;
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('offerteModal'));
  modal.show();
  const form = document.getElementById('billitInvoiceForm');
  const serialCheckbox = document.getElementById('billitIncludeSerials');
  form.querySelectorAll('input[name="invoiceKind"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (serialCheckbox && !serialCheckbox.disabled && radio.value === 'final' && radio.checked) {
        serialCheckbox.checked = true;
      }
    });
  });
  body.querySelectorAll('[data-billit-paid-toggle]').forEach(toggle => {
    toggle.addEventListener('click', async () => {
      const invoiceId = toggle.getAttribute('data-invoice-id');
      const nextPaid = toggle.getAttribute('data-paid') !== '1';
      try {
        toggle.disabled = true;
        await _setBillitInvoicePaidForConfig(project.id, configType, invoiceId, nextPaid);
        modal.hide();
        if (typeof onChange === 'function') await onChange();
        showToast(nextPaid ? 'Factuur gemarkeerd als betaald.' : 'Factuur terug op open gezet.', 'success');
      } catch (err) {
        toggle.disabled = false;
        showToast('Betaalstatus aanpassen mislukt: ' + (err.message || err), 'danger');
      }
    });
  });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const submit = document.getElementById('billitInvoiceSubmit');
    const status = document.getElementById('billitInvoiceStatus');
    const kind = form.querySelector('input[name="invoiceKind"]:checked')?.value || 'advance';
    const percentage = Number(document.getElementById('billitAdvancePct')?.value || 30);
    const amountExVat = Number(document.getElementById('billitFinalAmountExVat')?.value || 0);
    const includeSerialNumbers = document.getElementById('billitIncludeSerials')?.checked === true;
    try {
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Niet ingelogd.');
      if (kind === 'final' && !(amountExVat > 0)) throw new Error('Geef een openstaand bedrag ex. BTW op.');
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Factuur maken...';
      status.textContent = kind === 'final' ? 'Afrekening wordt aangemaakt...' : 'Voorschotfactuur wordt aangemaakt...';
      const token = await user.getIdToken();
      const endpoint = `https://europe-west1-${firebase.app().options.projectId}.cloudfunctions.net/createBillitOffer`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance-invoice',
          offerId: pdf.billitOrderId,
          invoiceKind: kind,
          percentage,
          amountExVat,
          includeSerialNumbers,
          serialNumbers: includeSerialNumbers ? serials : [],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Factuur maken mislukt.');
      const invoiceId = result.invoiceId || result.orderId || result.billit;
      if (!invoiceId) throw new Error('Billit maakte de factuur aan, maar gaf geen order-ID terug.');
      status.textContent = `Factuur #${invoiceId} aangemaakt. PDF wordt voorbereid...`;
      const billitPdf = await _waitForBillitPdf(endpoint, token, invoiceId, status);
      const file = _billitPdfToFile(billitPdf, invoiceId);
      await window.uploadProjectDocument(project.id, file, {
        title: kind === 'final' ? `Afrekening - Billit #${invoiceId}` : `Voorschotfactuur ${percentage}% - Billit #${invoiceId}`,
        documentKind: 'invoice',
        includeInCloseoutPdf: true,
        includeInInspectionPack: false,
      });
      const invoiceAmountExVat = Array.isArray(result.invoice?.OrderLines)
        ? result.invoice.OrderLines.reduce((sum, line) => sum + Number(line.UnitPriceExcl || 0) * Number(line.Quantity || 1), 0)
        : (kind === 'final' ? amountExVat : totalExVat * percentage / 100);
      await _recordBillitInvoiceForConfig(project.id, configType, {
        invoiceId: String(invoiceId),
        offerId: String(pdf.billitOrderId),
        kind,
        percentage: kind === 'advance' ? percentage : null,
        amountExVat: Number(invoiceAmountExVat.toFixed(2)),
        includeSerialNumbers,
        serialCount: includeSerialNumbers ? serials.length : 0,
        paid: false,
        paidAt: null,
        createdAt: new Date().toISOString(),
      });
      modal.hide();
      if (typeof onChange === 'function') await onChange();
      showToast(`Factuur #${invoiceId} is aangemaakt en gekoppeld.`, 'success');
    } catch (err) {
      status.textContent = err.message || String(err);
      showToast('Factuur maken mislukt: ' + (err.message || err), 'danger');
    } finally {
      submit.disabled = false;
      submit.innerHTML = '<i class="fa-solid fa-file-invoice-dollar me-1"></i> Factuur maken';
    }
  };
}

function openOfferteModal(project, configType, onUploaded) {
  ensureOfferteModal();
  const body = document.getElementById('offerteModalBody');
  const cfg  = _findConfigByType(project, configType);
  const existing = (project.offertes || {})[configType];
  document.querySelector('#offerteModal .modal-footer')?.classList.remove('d-none');

  const isManual = typeof window.isManualConfig === 'function' && window.isManualConfig(configType);
  const modalTitle = isManual
    ? `<span class="badge bg-primary" style="font-size:0.7rem; vertical-align:middle; margin-right:6px;">Manueel</span>${escapeHtml(cfg.omschrijving)}`
    : `${escapeHtml(cfg.type)} · ${escapeHtml(cfg.omschrijving || '')}`;

  body.innerHTML = `
    <div class="offerte-cfg-header">
      <div class="offerte-cfg-type" style="font-weight:600;">${modalTitle}</div>
      <div class="offerte-cfg-meta" style="color:var(--sp-muted);font-size:.9rem;margin-top:2px;">
        ${cfg.batCap ? escapeHtml(String(cfg.batCap)) + ' kWh · ' : ''}${cfg.batInv ? escapeHtml(String(cfg.batInv)) + ' kW omvormer · ' : ''}€ ${_formatEuros(cfg.priceEur)}
      </div>
    </div>

    ${existing ? `
      <div class="offerte-existing">
        <div><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> <strong>${escapeHtml(existing.filename || '')}</strong></div>
        <div style="color:var(--sp-muted);font-size:.85rem;">
          Geüpload door ${escapeHtml(existing.uploadedBy || 'onbekend')}${existing.uploadedAt && existing.uploadedAt.toDate ? ' op ' + _formatOfferteDate(existing.uploadedAt.toDate()) : ''}
        </div>
      </div>
    ` : ''}

    <div class="sp-drop-zone" id="offerteDropZone">
      <label for="offerteFileInput" class="visually-hidden">Kies offerte PDF</label>
      <input type="file" accept="application/pdf" id="offerteFileInput" />
      <div>
        ${existing ? 'Sleep nieuwe PDF om te vervangen' : 'Sleep offerte PDF hier'}<br/>
        <span style="color:var(--sp-muted);font-size:.9rem;">of klik om te kiezen</span>
      </div>
    </div>
    <div id="offerteUploadError" class="text-danger mt-2" style="display:none;"></div>
    <div id="offerteUploadProgress" class="mt-2" style="display:none;">Uploaden… <span>0%</span></div>
  `;

  _bindOfferteDropZone(project.id, configType, onUploaded);
  const el = document.getElementById('offerteModal');
  bootstrap.Modal.getOrCreateInstance(el).show();
}

function closeOfferteModal() {
  const el = document.getElementById('offerteModal');
  if (el) bootstrap.Modal.getOrCreateInstance(el).hide();
}

function _bindOfferteDropZone(projectId, configType, onUploaded) {
  const zone  = document.getElementById('offerteDropZone');
  const input = document.getElementById('offerteFileInput');
  const err   = document.getElementById('offerteUploadError');
  const prog  = document.getElementById('offerteUploadProgress');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) _handleOfferteFile(input.files[0]);
  });
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) _handleOfferteFile(f);
  });

  async function _handleOfferteFile(file) {
    err.style.display = 'none'; err.textContent = '';
    try {
      if (file.type !== 'application/pdf') throw new Error('Enkel PDF-bestanden');
      if (file.size > 10 * 1024 * 1024)    throw new Error('PDF is groter dan 10 MB');
      prog.style.display = 'block';
      prog.querySelector('span').textContent = '…';
      showSpinner();
      try {
        await uploadProjectOfferte(projectId, configType, file);
        closeOfferteModal();
        if (typeof onUploaded === 'function') await onUploaded();
      } finally {
        hideSpinner();
      }
    } catch (e) {
      err.textContent = e.message || String(e);
      err.style.display = 'block';
      prog.style.display = 'none';
    }
  }
}
