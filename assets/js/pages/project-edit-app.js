import { escapeHtml, showToast, showState, showSpinner, hideSpinner, showConfirm } from '../shared-helpers.js';
import { extractCsvForStorage } from '../csv.js';
import { attachSpeechToText } from '../speech-to-text.js';

// ─── STATE ───────────────────────────────────────────────────────────────────
const URL_PARAMS = new URLSearchParams(window.location.search);
const IS_NEW     = URL_PARAMS.has('new');
const PROJECT_ID = IS_NEW ? null : URL_PARAMS.get('project');

// Current working project state (metadata + basisgegevens). Populated on load.
let _project = null;

// Snapshot of houseAgeOver10Years at page-load time. If the user changes it
// before saving, we force-route the save through the calc view so the ROI
// reflects the new BTW rate (6% vs 21%) in all config installPrices.
let _initialHouseAge = null;

// Unsubscribe handle for the project-doc onSnapshot listener (Task 9).
// Module-scoped so the beforeunload cleanup can reach it across calls.
let _serialUnsub = null;
let _mapsLoaderPromise = null;
let _suppressAddressSearchInput = false;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('globalError');
  el.textContent = msg;
  el.classList.remove('hide');
}
function clearError() { document.getElementById('globalError').classList.add('hide'); }

function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add('is-invalid');
  const fb = el.parentElement.querySelector('.invalid-feedback');
  if (fb) fb.textContent = msg;
}
function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.remove('is-invalid');
}

const VOLTAGE_MEASUREMENT_FIELDS = {
  '1x230': [
    ['l1N',  'L1 - N'],
    ['l1Pe', 'L1 - PE'],
    ['nPe',  'N - PE'],
  ],
  '3x230': [
    ['l1L2', 'L1 - L2'],
    ['l1L3', 'L1 - L3'],
    ['l2L3', 'L2 - L3'],
    ['l1Pe', 'L1 - PE'],
    ['l2Pe', 'L2 - PE'],
    ['l3Pe', 'L3 - PE'],
  ],
  '3x400+N': [
    ['l1L2', 'L1 - L2'],
    ['l1L3', 'L1 - L3'],
    ['l2L3', 'L2 - L3'],
    ['l1N',  'L1 - N'],
    ['l2N',  'L2 - N'],
    ['l3N',  'L3 - N'],
    ['l1Pe', 'L1 - PE'],
    ['l2Pe', 'L2 - PE'],
    ['l3Pe', 'L3 - PE'],
    ['nPe',  'N - PE'],
  ],
};

function voltageFieldsForConnection(connectionType) {
  return VOLTAGE_MEASUREMENT_FIELDS[connectionType] || [];
}

function readOptionalNumber(value) {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pruneVoltageMeasurementsForConnection(connectionType) {
  const allowed = new Set(voltageFieldsForConnection(connectionType).map(([key]) => key));
  _project.technical = _project.technical || {};
  const current = _project.technical.voltageMeasurements || {};
  _project.technical.voltageMeasurements = Object.fromEntries(
    Object.entries(current).filter(([key]) => allowed.has(key))
  );
}

function addressGoogleApiKey(settings) {
  return (settings && (
    settings.addressAutocompleteGoogleMapsApiKey
    || settings.googleMapsApiKey
    || settings.googlePlacesApiKey
  )) || '';
}

async function fetchGoogleMapsApiKeyFromFunction() {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Niet ingelogd.');
  const token = await user.getIdToken();
  const projectId = firebase.app().options.projectId;
  const response = await fetch(`https://europe-west1-${projectId}.cloudfunctions.net/getGoogleMapsApiKey`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Google Maps API-key ophalen mislukt.');
  return data.apiKey || '';
}

function loadGooglePlaces(apiKey) {
  if (window.google && window.google.maps && window.google.maps.places) {
    return Promise.resolve(window.google.maps.places);
  }
  if (_mapsLoaderPromise) return _mapsLoaderPromise;
  _mapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'places',
      language: 'nl',
      region: 'BE',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google && window.google.maps && window.google.maps.places) resolve(window.google.maps.places);
      else reject(new Error('Google Places is niet beschikbaar.'));
    };
    script.onerror = () => reject(new Error('Google Maps script laden mislukt.'));
    document.head.appendChild(script);
  });
  return _mapsLoaderPromise;
}

function getPlaceComponent(place, type, useShort = false) {
  const comp = (place.address_components || []).find(c => (c.types || []).includes(type));
  if (!comp) return '';
  return useShort ? comp.short_name || comp.long_name || '' : comp.long_name || comp.short_name || '';
}

function placeToAddressStructured(place) {
  const route = getPlaceComponent(place, 'route');
  const number = getPlaceComponent(place, 'street_number');
  const postalCode = getPlaceComponent(place, 'postal_code', true);
  const city = getPlaceComponent(place, 'locality')
    || getPlaceComponent(place, 'postal_town')
    || getPlaceComponent(place, 'administrative_area_level_4')
    || getPlaceComponent(place, 'administrative_area_level_3');
  const countryCode = getPlaceComponent(place, 'country', true) || 'BE';
  const loc = place.geometry && place.geometry.location;
  return {
    street: route,
    houseNumber: number,
    bus: '',
    postalCode,
    city,
    countryCode,
    placeId: place.place_id || '',
    provider: 'google',
    lat: loc && typeof loc.lat === 'function' ? loc.lat() : null,
    lng: loc && typeof loc.lng === 'function' ? loc.lng() : null,
  };
}

function updateAddressFields(structured) {
  const s = structured || {};
  const values = {
    fAddressStreet: s.street || '',
    fAddressHouseNumber: s.houseNumber || '',
    fAddressBus: s.bus || '',
    fAddressPostalCode: s.postalCode || '',
    fAddressCity: s.city || '',
    fAddressCountry: s.countryCode || 'BE',
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

function readAddressFields() {
  return {
    street: document.getElementById('fAddressStreet')?.value.trim() || '',
    houseNumber: document.getElementById('fAddressHouseNumber')?.value.trim() || '',
    bus: document.getElementById('fAddressBus')?.value.trim() || '',
    postalCode: document.getElementById('fAddressPostalCode')?.value.trim() || '',
    city: document.getElementById('fAddressCity')?.value.trim() || '',
    countryCode: (document.getElementById('fAddressCountry')?.value.trim() || 'BE').toUpperCase(),
    provider: 'manual',
  };
}

function syncManualAddressFields() {
  _project.customer = _project.customer || {};
  const structured = readAddressFields();
  const hasStructured = [structured.street, structured.houseNumber, structured.bus, structured.postalCode, structured.city].some(Boolean);
  _project.customer.addressStructured = hasStructured ? structured : null;
  _project.customer.address = hasStructured ? formatStructuredAddress(structured) : (document.getElementById('fAddressSearch')?.value.trim() || '');
  const search = document.getElementById('fAddressSearch');
  if (search && search.value !== _project.customer.address) {
    _suppressAddressSearchInput = true;
    search.value = _project.customer.address;
    _suppressAddressSearchInput = false;
  }
  updateAddressValidationBadge();
}

function updateAddressValidationBadge() {
  const badge = document.getElementById('addressValidationBadge');
  if (!badge) return;
  const structured = normalizedAddressStructured(_project.customer || {});
  const isGoogle = structured && structured.provider === 'google' && structured.placeId;
  badge.className = `badge ${isGoogle ? 'text-bg-success' : 'text-bg-secondary'}`;
  badge.textContent = isGoogle ? 'Gevalideerd via Google' : 'Niet gevalideerd';
}

async function initAddressAutocomplete() {
  const input = document.getElementById('fAddressSearch');
  const hint = document.getElementById('addressAutocompleteHint');
  if (!input || !hint) return;
  try {
    const settings = await getSettings();
    const key = addressGoogleApiKey(settings) || await fetchGoogleMapsApiKeyFromFunction();
    if (!key) {
      hint.textContent = 'Google Maps API-key ontbreekt; vul het adres manueel in.';
      return;
    }
    hint.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Adres-autocomplete laden...';
    await loadGooglePlaces(key);
    const autocomplete = new window.google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: ['be'] },
      fields: ['address_components', 'formatted_address', 'geometry', 'place_id'],
      types: ['address'],
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place || !place.place_id) return;
      const structured = placeToAddressStructured(place);
      _project.customer = _project.customer || {};
      _project.customer.addressStructured = structured;
      _project.customer.address = place.formatted_address || formatStructuredAddress(structured);
      _suppressAddressSearchInput = true;
      input.value = _project.customer.address;
      _suppressAddressSearchInput = false;
      updateAddressFields(structured);
      updateAddressValidationBadge();
      hint.textContent = 'Adres gevalideerd. Busnummer kan je eventueel manueel aanvullen.';
    });
    hint.textContent = 'Kies een suggestie om het adres te valideren.';
  } catch (e) {
    console.warn('Adres-autocomplete laden mislukt:', e);
    hint.textContent = 'Adres-autocomplete niet beschikbaar; vul het adres manueel in.';
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    const errEl = document.getElementById('signInError');
    errEl.classList.add('hide');
    try { await signInWithGoogle(); }
    catch (e) {
      errEl.textContent = 'Aanmelden mislukt: ' + (e && e.message ? e.message : e);
      errEl.classList.remove('hide');
    }
  });
  document.getElementById('btnSignOutNW').addEventListener('click', () => signOut());
  document.getElementById('btnCancel').addEventListener('click', () => { window.location.href = 'dashboard.html'; });

  onAuthStateChanged(async user => {
    if (!user) { showState('stateLoggedOut'); return; }
    if (!isWhitelisted(user)) {
      document.getElementById('notWhitelistedEmail').textContent = user.email || '(onbekend)';
      showState('stateNotWhitelisted');
      return;
    }
    showState('stateAuthorized');
    try { await bootstrap(); }
    catch (e) { showError('Laden mislukt: ' + (e && e.message ? e.message : e)); }
  });
});

async function bootstrap() {
  showSpinner({ message: 'Project laden…' });
  try {
    if (IS_NEW) {
      _project = {
        projectName: '',
        customerName: '',
        status: DEFAULT_STATUS,
        ...newEmptyProjectMetadata(),
        csvUpload: null,
      };
      document.getElementById('pageTitle').innerHTML = '<i class="fa-solid fa-bolt text-primary" aria-hidden="true"></i> Nieuw project';
    } else {
      if (!PROJECT_ID) { showError('Geen project-id opgegeven.'); return; }
      const proj = await getProject(PROJECT_ID);
      if (!proj || proj.deletedAt) { showError('Project niet gevonden of verwijderd.'); return; }
      _project = {
        ...proj,
        ...mergeProjectMetadata(proj),
      };
      _initialHouseAge = (_project.site && _project.site.houseAgeOver10Years !== undefined)
        ? _project.site.houseAgeOver10Years : null;
      document.getElementById('pageTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-primary" aria-hidden="true"></i> ' + escapeHtml(getProjectLabel(proj));
    }
    renderSections();
    wireActions();

    // Offertes-section click delegation — attached once to the stable slot.
    ensureOfferteModal();
    const offertesSlot = document.getElementById('blokOffertes-slot');
    if (offertesSlot) wireOffertesClicks(offertesSlot, () => _project, _refreshOffertes);

    // Subscribe to project-doc for live serial-list updates (Task 9).
    // Only the Blok D serial-list re-renders so user-typed fields in other
    // blocks aren't clobbered.
    _subscribeSerials();
  } finally {
    hideSpinner();
  }
}

// Live-subscribe to the project doc so OCR results written by the Cloud
// Function show up in Blok D without a manual reload. Edit-mode only —
// in new-project mode there's no doc yet.
function _subscribeSerials() {
  // Unsubscribe any prior handle before registering a new one — bootstrap()
  // re-runs on auth-state transitions (token refresh) so the same call site
  // can fire multiple times in the lifetime of a tab.
  if (_serialUnsub) {
    try { _serialUnsub(); } catch (_) {}
    _serialUnsub = null;
  }
  if (!PROJECT_ID) return;
  const db = firebase.firestore();
  _serialUnsub = db.collection('projects').doc(PROJECT_ID).onSnapshot(snap => {
    if (!snap.exists) return;
    const fresh = mergeProjectMetadata(snap.data());
    const cur   = _project.serialNumbers || [];
    const next  = fresh.serialNumbers || [];
    if (_serialListEqual(cur, next)) return;
    _project.serialNumbers = next;
    rerenderBlokD({ preserveSerialInputs: true });
  }, err => {
    console.warn('serial onSnapshot error', err);
  });
}

// Shallow-compare two serial-lists on the fields the UI renders. Any drift
// triggers a Blok D re-render. Keep this cheap — fires on every project-doc
// change including unrelated metadata edits.
function _serialListEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!x || !y) return false;
    if (x.id !== y.id) return false;
    if ((x.value       || '')   !== (y.value       || ''))   return false;
    if ((x.ocrStatus   || null) !== (y.ocrStatus   || null)) return false;
    if ((x.category    || null) !== (y.category    || null)) return false;
    if ((x.bebatStatus || null) !== (y.bebatStatus || null)) return false;
  }
  return true;
}

// Cleanup the snapshot listener on page unload so Firestore doesn't keep
// the connection alive past the lifecycle of this page.
window.addEventListener('beforeunload', () => {
  if (_serialUnsub) { try { _serialUnsub(); } catch (_) {} _serialUnsub = null; }
});

function renderSections() {
  // Blok A — Voor de berekening (Task 6)
  document.getElementById('blokA-slot').innerHTML = sectionBlokA();
  wireBlokA();
  document.getElementById('blokB-slot').innerHTML = sectionBlokB();
  wireBlokB();
  document.getElementById('blokC-slot').innerHTML = sectionBlokC();
  wireBlokC();
  renderBlokOffertes();
  document.getElementById('blokD-slot').innerHTML = sectionBlokD();
  wireBlokD();
  const opsSlot = document.getElementById('blokOps-slot');
  if (opsSlot) {
    opsSlot.innerHTML = sectionOps();
    wireOps();
  }
  updateSaveCalcEnabled();
}

// Offertes block — shared UI from assets/js/offertes-ui.js.
// Hidden in new-project mode (no Firestore doc to reference yet).
function renderBlokOffertes() {
  const slot = document.getElementById('blokOffertes-slot');
  if (!slot) return;
  if (IS_NEW) {
    slot.innerHTML = '';
    slot.classList.add('d-none');
    return;
  }
  slot.classList.remove('d-none');
  const inner = renderOffertesCards(_project);
  const body = inner || '<p class="text-muted mb-0">Nog geen configuraties berekend voor dit project. Draai eerst een berekening vanuit <a href="index.html?project=' + encodeURIComponent(PROJECT_ID) + '">de ROI-calculator</a>.</p>';
  slot.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0"><i class="fa-solid fa-file-invoice text-primary me-2"></i>Configs &amp; offertes</h5>
      </div>
      <div class="card-body">${body}</div>
    </div>
  `;
}

async function _refreshOffertes() {
  if (!PROJECT_ID) return;
  try {
    const fresh = await getProject(PROJECT_ID);
    if (!fresh) return;
    // Merge only the fields the offertes section cares about — keep the user's
    // in-flight edits to other Blok A/B/C/D fields intact.
    _project.offertes         = fresh.offertes || {};
    _project.lastCalcRun      = fresh.lastCalcRun || null;
    renderBlokOffertes();
  } catch (err) {
    showToast('Kon offertes niet verversen: ' + (err && err.message ? err.message : String(err)), 'danger');
  }
}

function sectionBlokA() {
  const p = _project;
  const site = p.site || { houseAgeOver10Years: null };
  const sup  = p.supplier || { isSingleTariff: false, priceDay: null, priceNight: null };
  const calcD = p.calcDefaults || { btw: null, keuring: 'yes' };
  const invs = (p.solar && p.solar.inverters) || [];
  const totalKw = invs.reduce((s, i) => s + (Number(i.powerKw) || 0), 0);

  const ageRadio = (v, label) => {
    const match = site.houseAgeOver10Years === v;
    const strV = String(v);
    const id = 'fAge_' + strV;
    return `<div class="form-check form-check-inline">
      <input class="form-check-input" type="radio" name="fHouseAge" value="${strV}" id="${id}" ${match ? 'checked' : ''}/>
      <label class="form-check-label" for="${id}">${label}</label>
    </div>`;
  };

  let inverterFieldHtml;
  if (invs.length >= 2) {
    inverterFieldHtml = `
      <label class="form-label">Totaal omvormer-vermogen</label>
      <div class="input-group">
        <input type="text" class="form-control" value="${totalKw} kW — som van ${invs.length} omvormers" readonly />
        <button type="button" class="btn btn-outline-secondary" id="fInverterDeeplink">Beheer per omvormer →</button>
      </div>
    `;
  } else {
    const val = invs.length === 1 && invs[0].powerKw != null ? invs[0].powerKw : '';
    inverterFieldHtml = `
      <label for="fTotalKw" class="form-label">Omvormer-vermogen (kW) <span class="text-danger">*</span></label>
      <input type="number" id="fTotalKw" class="form-control" min="0" step="0.1" value="${val}" placeholder="bv. 5.0" />
      <div class="form-text">Eén omvormer? Vul hier in. Meer? Voeg details toe in "Technische opmeting".</div>
    `;
  }

  const priceNightHtml = sup.isSingleTariff === false ? `
    <div class="col-12 col-md-4">
      <label for="fPriceNight" class="form-label">Prijs nacht (€/kWh)</label>
      <input type="number" id="fPriceNight" class="form-control" min="0" step="0.001" value="${sup.priceNight != null ? sup.priceNight : ''}" />
    </div>
  ` : '';

  return `
    <div class="card border-primary">
      <div class="card-header bg-primary-subtle">
        <h5 class="mb-0"><i class="fa-solid fa-bolt text-primary me-2"></i>Voor de berekening</h5>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label for="fCustomerName" class="form-label">Klantnaam <span class="text-danger">*</span></label>
            <input type="text" id="fCustomerName" class="form-control" maxlength="120" value="${escapeHtml(p.customerName || '')}" required />
          </div>
          <div class="col-12 col-md-6">
            <label for="fProjectName" class="form-label">Projectnaam <span class="text-muted small fw-normal">(optioneel)</span></label>
            <input type="text" id="fProjectName" class="form-control" maxlength="120" placeholder="Leeg = klantnaam wordt gebruikt" value="${escapeHtml(p.projectName || '')}" />
          </div>

          <div class="col-12">
            <label class="form-label">Leeftijd woning (bepaalt BTW)</label>
            <div>
              ${ageRadio(true,  '10 jaar of ouder (6% BTW)')}
              ${ageRadio(false, 'Jonger dan 10 jaar (21% BTW)')}
            </div>
          </div>

          <div class="col-12 col-md-4">
            <label class="form-label">Tarief-type</label>
            <div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="fTariffMode" value="single" id="fTariffSingle" ${sup.isSingleTariff === true ? 'checked' : ''}/>
                <label class="form-check-label" for="fTariffSingle">Enkel tarief</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="fTariffMode" value="dual" id="fTariffDual" ${sup.isSingleTariff !== true ? 'checked' : ''}/>
                <label class="form-check-label" for="fTariffDual">Dag/nacht</label>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <label for="fPriceDay" class="form-label">Prijs ${sup.isSingleTariff === true ? '' : 'dag '}(€/kWh)</label>
            <input type="number" id="fPriceDay" class="form-control" min="0" step="0.001" value="${sup.priceDay != null ? sup.priceDay : ''}" />
          </div>
          ${priceNightHtml}

          <div class="col-12">
            ${inverterFieldHtml}
          </div>

          <div class="col-12">
            <label class="form-label">CSV Fluvius</label>
            <input type="file" id="fCsv" class="form-control" accept=".csv" />
            <div class="form-text" id="fCsvStatus">${_csvStatusLine()}</div>
          </div>

          <div class="col-12">
            <details class="mt-2">
              <summary class="text-muted small">Extra opties (keuring, leverancier-naam)</summary>
              <div class="row g-3 mt-1">
                <div class="col-12 col-md-6">
                  <label for="fKeuring" class="form-label">Keuring</label>
                  <select id="fKeuring" class="form-select">
                    <option value="yes" ${calcD.keuring === 'yes' ? 'selected' : ''}>Ja</option>
                    <option value="no"  ${calcD.keuring === 'no'  ? 'selected' : ''}>Nee</option>
                  </select>
                </div>
                <div class="col-12 col-md-6">
                  <label for="fSupplierName" class="form-label">Leverancier-naam</label>
                  <input type="text" id="fSupplierName" class="form-control" maxlength="80" value="${escapeHtml(sup.name || '')}" />
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _csvStatusLine() {
  if (_pendingCsv) return `Klaar om op te slaan: ${escapeHtml(_pendingCsv.eanCode || 'nieuw CSV')}`;
  if (!_project.csvUpload) return 'Nog geen CSV geüpload.';
  const u = _project.csvUpload;
  return `Vorige upload: ${escapeHtml(u.meterNr || u.eanCode || 'onbekend')}`;
}

function wireBlokA() {
  document.getElementById('fCustomerName').addEventListener('input', e => {
    _project.customerName = e.target.value;
  });
  document.getElementById('fProjectName').addEventListener('input', e => {
    _project.projectName = e.target.value;
  });

  document.querySelectorAll('input[name="fHouseAge"]').forEach(r => {
    r.addEventListener('change', e => {
      const v = e.target.value;
      _project.site = _project.site || {};
      _project.site.houseAgeOver10Years =
        v === 'true'  ? true  :
        v === 'false' ? false :
                        null;
      rerenderBlokA();
      updateSaveCalcEnabled();
    });
  });

  document.querySelectorAll('input[name="fTariffMode"]').forEach(r => {
    r.addEventListener('change', e => {
      _project.supplier = _project.supplier || {};
      _project.supplier.isSingleTariff = (e.target.value === 'single');
      rerenderBlokA();
      updateSaveCalcEnabled();
    });
  });
  document.getElementById('fPriceDay').addEventListener('input', e => {
    _project.supplier = _project.supplier || {};
    _project.supplier.priceDay = e.target.value === '' ? null : parseFloat(e.target.value);
    updateSaveCalcEnabled();
  });
  const pn = document.getElementById('fPriceNight');
  if (pn) pn.addEventListener('input', e => {
    _project.supplier = _project.supplier || {};
    _project.supplier.priceNight = e.target.value === '' ? null : parseFloat(e.target.value);
    updateSaveCalcEnabled();
  });

  const totalKwInput = document.getElementById('fTotalKw');
  if (totalKwInput) {
    totalKwInput.addEventListener('input', e => {
      _project.solar = _project.solar || { inverters: [] };
      const invs = _project.solar.inverters;
      const v = e.target.value === '' ? null : parseFloat(e.target.value);
      if (invs.length === 0) {
        invs.push({ id: genInverterId(), powerKw: v, brand: '', model: '', panelCount: null, circuitCount: null, orientation: '' });
      } else {
        invs[0].powerKw = v;
      }
      updateSaveCalcEnabled();
    });
  }
  const dlBtn = document.getElementById('fInverterDeeplink');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    document.getElementById('blokC-slot').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('fCsv').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    showSpinner({ message: 'CSV verwerken…' });
    try {
      const csvText = await file.text();
      _pendingCsv   = extractCsvForStorage(csvText);
      document.getElementById('fCsvStatus').textContent = _csvStatusLine();
      updateSaveCalcEnabled();
    } catch (err) {
      document.getElementById('fCsvStatus').textContent = 'CSV-fout: ' + (err && err.message ? err.message : String(err));
    } finally {
      hideSpinner();
    }
  });

  const keur = document.getElementById('fKeuring');
  if (keur) keur.addEventListener('change', e => {
    _project.calcDefaults = _project.calcDefaults || {};
    _project.calcDefaults.keuring = e.target.value;
  });
  const supN = document.getElementById('fSupplierName');
  if (supN) supN.addEventListener('input', e => {
    _project.supplier = _project.supplier || {};
    _project.supplier.name = e.target.value;
  });
}

function rerenderBlokA() {
  document.getElementById('blokA-slot').innerHTML = sectionBlokA();
  wireBlokA();
}

function sectionBlokB() {
  const c = _project.customer || {};
  const planning = _project.planning || {};
  const inspection = _project.inspection || {};
  const structured = normalizedAddressStructured(c) || {};
  const addressValue = c.address || formatCustomerAddress(c);
  const isGoogleAddress = structured.provider === 'google' && structured.placeId;
  const status = _project.status || DEFAULT_STATUS;
  const statusOptions = PROJECT_STATUSES.map(s =>
    `<option value="${s.key}" ${s.key === status ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');
  return `
    <div class="card collapsible-card">
      <div class="card-header" data-bs-toggle="collapse" data-bs-target="#blokB-body" aria-expanded="true" aria-controls="blokB-body">
        <h5 class="mb-0"><i class="fa-solid fa-user text-primary me-2"></i>Klant &amp; situatie</h5>
        <i class="fa-solid fa-chevron-down chev" aria-hidden="true"></i>
      </div>
      <div id="blokB-body" class="collapse show">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label for="fStatus" class="form-label">Status</label>
              <select id="fStatus" class="form-select">${statusOptions}</select>
            </div>
            <div class="col-12">
              <h6 class="text-muted mb-2 mt-2">Planning</h6>
              <div class="row g-3">
                <div class="col-12 col-md-4">
                  <label for="fVisitPlannedDate" class="form-label">Plaatsbezoek ingepland</label>
                  <input type="date" id="fVisitPlannedDate" class="form-control" value="${escapeHtml(planning.visitPlannedDate || '')}" />
                </div>
                <div class="col-12 col-md-4">
                  <label for="fInstallationPlannedDate" class="form-label">Installatie ingepland</label>
                  <input type="date" id="fInstallationPlannedDate" class="form-control" value="${escapeHtml(planning.installationPlannedDate || '')}" />
                </div>
                <div class="col-12 col-md-4">
                  <label for="fInspectionPlannedDate" class="form-label">Keuring ingepland</label>
                  <input type="date" id="fInspectionPlannedDate" class="form-control" value="${escapeHtml(planning.inspectionPlannedDate || '')}" />
                </div>
                <div class="col-12 col-md-4">
                  <label for="fVisitDoneDate" class="form-label">Plaatsbezoek uitgevoerd</label>
                  <input type="date" id="fVisitDoneDate" class="form-control" value="${escapeHtml(planning.visitDoneDate || '')}" />
                </div>
                <div class="col-12 col-md-4">
                  <label for="fInstallationDoneDate" class="form-label">Installatie uitgevoerd</label>
                  <input type="date" id="fInstallationDoneDate" class="form-control" value="${escapeHtml(planning.installationDoneDate || '')}" />
                </div>
                <div class="col-12 col-md-4">
                  <label for="fInspectionDoneDate" class="form-label">Keuring uitgevoerd</label>
                  <input type="date" id="fInspectionDoneDate" class="form-control" value="${escapeHtml(planning.inspectionDoneDate || '')}" />
                </div>
              </div>
            </div>
            <div class="col-12">
              <div class="d-flex justify-content-between align-items-center gap-2">
                <label for="fAddressSearch" class="form-label mb-0">Adres zoeken</label>
                <span id="addressValidationBadge" class="badge ${isGoogleAddress ? 'text-bg-success' : 'text-bg-secondary'}">${isGoogleAddress ? 'Gevalideerd via Google' : 'Niet gevalideerd'}</span>
              </div>
              <input type="text" id="fAddressSearch" class="form-control mt-1" maxlength="240" autocomplete="off" placeholder="Begin te typen en kies een suggestie" value="${escapeHtml(addressValue)}" />
              <div class="form-text" id="addressAutocompleteHint">Autocomplete laden...</div>
            </div>
            <div class="col-12 col-md-5">
              <label for="fAddressStreet" class="form-label">Straat</label>
              <input type="text" id="fAddressStreet" class="form-control address-structured-field" maxlength="120" value="${escapeHtml(structured.street || '')}" />
            </div>
            <div class="col-6 col-md-2">
              <label for="fAddressHouseNumber" class="form-label">Nr</label>
              <input type="text" id="fAddressHouseNumber" class="form-control address-structured-field" maxlength="20" value="${escapeHtml(structured.houseNumber || '')}" />
            </div>
            <div class="col-6 col-md-2">
              <label for="fAddressBus" class="form-label">Bus</label>
              <input type="text" id="fAddressBus" class="form-control address-structured-field" maxlength="20" value="${escapeHtml(structured.bus || '')}" />
            </div>
            <div class="col-6 col-md-3">
              <label for="fAddressPostalCode" class="form-label">Postcode</label>
              <input type="text" id="fAddressPostalCode" class="form-control address-structured-field" maxlength="12" value="${escapeHtml(structured.postalCode || '')}" />
            </div>
            <div class="col-6 col-md-6">
              <label for="fAddressCity" class="form-label">Gemeente/stad</label>
              <input type="text" id="fAddressCity" class="form-control address-structured-field" maxlength="80" value="${escapeHtml(structured.city || '')}" />
            </div>
            <div class="col-6 col-md-3">
              <label for="fAddressCountry" class="form-label">Land</label>
              <input type="text" id="fAddressCountry" class="form-control address-structured-field" maxlength="2" value="${escapeHtml(structured.countryCode || 'BE')}" />
            </div>
            <div class="col-12 col-md-6">
              <label for="fPhone" class="form-label">Telefoon</label>
              <input type="tel" id="fPhone" class="form-control" maxlength="40" value="${escapeHtml(c.phone || '')}" />
            </div>
            <div class="col-12 col-md-6">
              <label for="fEmail" class="form-label">E-mail</label>
              <input type="email" id="fEmail" class="form-control" maxlength="120" value="${escapeHtml(c.email || '')}" />
            </div>
            <div class="col-12">
              <h6 class="text-muted mb-2 mt-2">Keuring</h6>
              <div class="row g-3">
                <div class="col-12 col-md-6">
                  <label for="fInspectionCompany" class="form-label">Keuringsfirma</label>
                  <input type="text" id="fInspectionCompany" class="form-control" maxlength="120" value="${escapeHtml(inspection.company || '')}" />
                </div>
                <div class="col-12 col-md-6">
                  <label for="fInspectionReference" class="form-label">Referentie</label>
                  <input type="text" id="fInspectionReference" class="form-control" maxlength="120" value="${escapeHtml(inspection.reference || '')}" />
                </div>
                <div class="col-12">
                  <label for="fInspectionNotes" class="form-label">Keuring opmerkingen</label>
                  <textarea id="fInspectionNotes" class="form-control" rows="2" maxlength="1000">${escapeHtml(inspection.notes || '')}</textarea>
                </div>
              </div>
            </div>
            <div class="col-12">
              <label for="fSituation" class="form-label">Situatie</label>
              <div class="input-group">
                <textarea id="fSituation" class="form-control" rows="2" maxlength="500">${escapeHtml(_project.situation || '')}</textarea>
              </div>
            </div>
            <div class="col-12">
              <label for="fNotes" class="form-label">Algemene notities</label>
              <div class="input-group">
                <textarea id="fNotes" class="form-control" rows="3" maxlength="2000">${escapeHtml(_project.notes || '')}</textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireBlokB() {
  document.getElementById('fStatus').addEventListener('change', e => {
    _project.status = e.target.value;
  });
  [
    ['fVisitPlannedDate', 'visitPlannedDate'],
    ['fVisitDoneDate', 'visitDoneDate'],
    ['fInstallationPlannedDate', 'installationPlannedDate'],
    ['fInstallationDoneDate', 'installationDoneDate'],
    ['fInspectionPlannedDate', 'inspectionPlannedDate'],
    ['fInspectionDoneDate', 'inspectionDoneDate'],
  ].forEach(([fieldId, key]) => {
    document.getElementById(fieldId).addEventListener('input', e => {
      _project.planning = _project.planning || {};
      _project.planning[key] = e.target.value || null;
    });
  });
  const search = document.getElementById('fAddressSearch');
  search.addEventListener('input', e => {
    if (_suppressAddressSearchInput) return;
    _project.customer = _project.customer || {};
    _project.customer.address = e.target.value;
    _project.customer.addressStructured = null;
    updateAddressFields(null);
    updateAddressValidationBadge();
  });
  document.querySelectorAll('.address-structured-field').forEach(el => {
    el.addEventListener('input', syncManualAddressFields);
  });
  initAddressAutocomplete();
  document.getElementById('fPhone').addEventListener('input', e => {
    _project.customer = _project.customer || {};
    _project.customer.phone = e.target.value;
  });
  document.getElementById('fEmail').addEventListener('input', e => {
    _project.customer = _project.customer || {};
    _project.customer.email = e.target.value;
  });
  [
    ['fInspectionCompany', 'company'],
    ['fInspectionReference', 'reference'],
    ['fInspectionNotes', 'notes'],
  ].forEach(([fieldId, key]) => {
    document.getElementById(fieldId).addEventListener('input', e => {
      _project.inspection = _project.inspection || {};
      _project.inspection[key] = e.target.value;
    });
  });
  document.getElementById('fSituation').addEventListener('input', e => {
    _project.situation = e.target.value;
  });
  document.getElementById('fNotes').addEventListener('input', e => {
    _project.notes = e.target.value;
  });
  ['fSituation', 'fNotes', 'fInspectionNotes'].forEach(id => {
    const textarea = document.getElementById(id);
    attachSpeechToText(textarea, {
      title: id === 'fSituation' ? 'Situatie dicteren in het Nederlands'
        : id === 'fInspectionNotes' ? 'Keuring opmerkingen dicteren in het Nederlands'
          : 'Notities dicteren in het Nederlands',
      ariaLabel: id === 'fSituation' ? 'Situatie dicteren'
        : id === 'fInspectionNotes' ? 'Keuring opmerkingen dicteren'
          : 'Notities dicteren',
    });
    textarea.addEventListener('speech-to-text-error', (e) => {
      showToast(e.detail && e.detail.message ? e.detail.message : 'Dicteren mislukt.', 'warning');
    });
  });

  // Collapse-toggle: restore persisted state + wire persistence on click.
  const header = document.querySelector('#blokB-slot .card-header');
  const body   = document.getElementById('blokB-body');
  if (_getCardCollapsed('B') === true) {
    body.classList.remove('show');
    header.setAttribute('aria-expanded', 'false');
  }
  header.addEventListener('click', () => {
    setTimeout(() => {
      _setCardCollapsed('B', !body.classList.contains('show'));
    }, 0);
  });
}

const _CARD_COLLAPSE_KEY = 'smartpeak.editCardCollapsed';
function _getCardCollapsed(blok) {
  try { return (JSON.parse(localStorage.getItem(_CARD_COLLAPSE_KEY)) || {})[blok] === true; }
  catch { return false; }
}
function _setCardCollapsed(blok, collapsed) {
  try {
    const current = JSON.parse(localStorage.getItem(_CARD_COLLAPSE_KEY)) || {};
    current[blok] = collapsed;
    localStorage.setItem(_CARD_COLLAPSE_KEY, JSON.stringify(current));
  } catch {}
}

function sectionBlokC() {
  const el = _project.electrical || {};
  const c  = _project.cabinet    || {};
  const technical = _project.technical || {};
  const voltages = technical.voltageMeasurements || {};
  const voltageFields = voltageFieldsForConnection(el.connectionType);
  const invs = (_project.solar && _project.solar.inverters) || [];

  const connTypes = ['', ...CONNECTION_TYPES].map(t =>
    `<option value="${t}" ${t === (el.connectionType || '') ? 'selected' : ''}>${t === '' ? '— Niet bepaald —' : t}</option>`
  ).join('');

  const triRow = (label, key, value) => `
    <div class="col-12 col-md-6">
      <label class="form-label">${label}</label>
      ${triStateHtml('fCab_' + key, value)}
    </div>
  `;

  const voltageFieldsHtml = voltageFields.length > 0
    ? voltageFields.map(([key, label]) => `
      <div class="col-6 col-md-4">
        <label for="fVoltage_${key}" class="form-label">${label}</label>
        <div class="input-group">
          <input type="number" id="fVoltage_${key}" data-voltage-field="${key}" class="form-control" min="0" step="0.1" value="${voltages[key] != null ? voltages[key] : ''}" />
          <span class="input-group-text">V</span>
        </div>
      </div>
    `).join('')
    : '<div class="col-12"><p class="text-muted small mb-0">Kies eerst het type aansluiting om de juiste spanningsmetingen te tonen.</p></div>';

  const inverterCards = invs.map((inv, idx) => `
    <div class="card mb-2" data-inv-id="${inv.id}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <h6 class="mb-0">Omvormer ${idx + 1}</h6>
          <button type="button" class="btn-close" aria-label="Verwijder" data-remove-inv="${inv.id}"></button>
        </div>
        <div class="row g-2">
          <div class="col-12 col-md-4">
            <label class="form-label">Vermogen (kW) <span class="text-danger">*</span></label>
            <input type="number" data-inv-field="powerKw" data-inv-id="${inv.id}" class="form-control" min="0" step="0.1" value="${inv.powerKw != null ? inv.powerKw : ''}" required />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Merk</label>
            <input type="text" data-inv-field="brand" data-inv-id="${inv.id}" class="form-control" maxlength="60" value="${escapeHtml(inv.brand || '')}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Model</label>
            <input type="text" data-inv-field="model" data-inv-id="${inv.id}" class="form-control" maxlength="60" value="${escapeHtml(inv.model || '')}" />
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label">Panelen</label>
            <input type="number" data-inv-field="panelCount" data-inv-id="${inv.id}" class="form-control" min="0" step="1" value="${inv.panelCount != null ? inv.panelCount : ''}" />
          </div>
          <div class="col-6 col-md-4">
            <label class="form-label">Kringen</label>
            <input type="number" data-inv-field="circuitCount" data-inv-id="${inv.id}" class="form-control" min="0" step="1" value="${inv.circuitCount != null ? inv.circuitCount : ''}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Ligging</label>
            <input type="text" data-inv-field="orientation" data-inv-id="${inv.id}" class="form-control" maxlength="40" value="${escapeHtml(inv.orientation || '')}" />
          </div>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="card collapsible-card">
      <div class="card-header" data-bs-toggle="collapse" data-bs-target="#blokC-body" aria-expanded="true" aria-controls="blokC-body">
        <h5 class="mb-0"><i class="fa-solid fa-screwdriver-wrench text-primary me-2"></i>Technische opmeting</h5>
        <i class="fa-solid fa-chevron-down chev" aria-hidden="true"></i>
      </div>
      <div id="blokC-body" class="collapse show">
        <div class="card-body">
          <h6 class="text-muted mb-2">Aansluiting</h6>
          <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
              <label for="fConnectionType" class="form-label">Type aansluiting</label>
              <select id="fConnectionType" class="form-select">${connTypes}</select>
            </div>
            <div class="col-12 col-md-6">
              <label for="fFuseRating" class="form-label">Zekeringsterkte Fluvius-zijde (A)</label>
              <input type="number" id="fFuseRating" class="form-control" min="0" step="1" value="${el.fuseRatingA != null ? el.fuseRatingA : ''}" />
            </div>
          </div>

          <h6 class="text-muted mb-2">Zekeringkast</h6>
          <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
              <label for="fFreeUnits" class="form-label">Vrije modules</label>
              <input type="number" id="fFreeUnits" class="form-control" min="0" step="1" value="${c.freeUnits != null ? c.freeUnits : ''}" />
            </div>
            <div class="col-12 col-md-6">
              <label for="fWiringDiameter" class="form-label">Diameter bekabeling (mm²)</label>
              <input type="number" id="fWiringDiameter" class="form-control" min="0" step="0.5" value="${c.wiringDiameterMm2 != null ? c.wiringDiameterMm2 : ''}" />
            </div>
            ${triRow('Rem-automaat aanwezig?',          'hasRemAutomaat',        c.hasRemAutomaat)}
            ${triRow('Stopcontact bij Fluvius?',        'hasOutletNearFluvius',  c.hasOutletNearFluvius)}
            ${triRow('Wifi bij Fluvius?',               'hasWifiNearFluvius',    c.hasWifiNearFluvius)}
            ${triRow('Plaats voor batterijen?',         'batteryPlacementRoom',  c.batteryPlacementRoom)}
            ${triRow('Wifi bij zekeringkast?',          'hasWifiNearCabinet',    c.hasWifiNearCabinet)}
            <div class="col-12">
              <label class="form-label mb-1">Meting fase ↔ aarde</label>
              <div class="d-flex flex-wrap gap-3">
                <div class="form-check">
                  <input type="radio" class="form-check-input" name="lineGround" id="fLgNone" value="" ${!c.lineGroundChecked ? 'checked' : ''} />
                  <label class="form-check-label" for="fLgNone">Niet gemeten</label>
                </div>
                <div class="form-check">
                  <input type="radio" class="form-check-input" name="lineGround" id="fLgUnder30" value="under30" ${c.lineGroundChecked === 'under30' || c.lineGroundChecked === true ? 'checked' : ''} />
                  <label class="form-check-label" for="fLgUnder30">Uitgevoerd — onder 30 V</label>
                </div>
                <div class="form-check">
                  <input type="radio" class="form-check-input" name="lineGround" id="fLgOver30" value="over30" ${c.lineGroundChecked === 'over30' ? 'checked' : ''} />
                  <label class="form-check-label" for="fLgOver30">Uitgevoerd — boven 30 V</label>
                </div>
              </div>
            </div>
          </div>

          <h6 class="text-muted mb-2">Metingen</h6>
          <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
              <label class="form-label">Aardweerstand gemeten?</label>
              ${triStateHtml('fEarthResistanceMeasured', technical.earthResistanceMeasured)}
            </div>
            <div class="col-6 col-md-3">
              <label for="fEarthResistanceOhm" class="form-label">Aardweerstand</label>
              <div class="input-group">
                <input type="number" id="fEarthResistanceOhm" class="form-control" min="0" step="0.1" value="${technical.earthResistanceOhm != null ? technical.earthResistanceOhm : ''}" />
                <span class="input-group-text">Ω</span>
              </div>
            </div>
            <div class="col-6 col-md-3">
              <label for="fEarthResistanceMeasuredDate" class="form-label">Meetdatum</label>
              <input type="date" id="fEarthResistanceMeasuredDate" class="form-control" value="${escapeHtml(technical.earthResistanceMeasuredDate || '')}" />
            </div>
          </div>

          <h6 class="text-muted mb-2">Spanningsmetingen</h6>
          <div class="row g-3 mb-3">
            ${voltageFieldsHtml}
          </div>

          <div class="mb-3">
            <label for="fTechnicalNotes" class="form-label">Technische opmerkingen</label>
            <textarea id="fTechnicalNotes" class="form-control" rows="2" maxlength="1000">${escapeHtml(technical.technicalNotes || '')}</textarea>
          </div>

          <h6 class="text-muted mb-2">Omvormer(s)</h6>
          <div id="peInverterList">${inverterCards}</div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="fAddInverter"><i class="fa-solid fa-plus me-1"></i>Omvormer toevoegen</button>
        </div>
      </div>
    </div>
  `;
}

function wireBlokC() {
  // Aansluiting
  document.getElementById('fConnectionType').addEventListener('change', e => {
    _project.electrical = _project.electrical || {};
    _project.electrical.connectionType = e.target.value || null;
    pruneVoltageMeasurementsForConnection(_project.electrical.connectionType);
    rerenderBlokC();
  });
  document.getElementById('fFuseRating').addEventListener('input', e => {
    _project.electrical = _project.electrical || {};
    const v = parseFloat(e.target.value);
    _project.electrical.fuseRatingA = isNaN(v) ? null : v;
  });

  // Zekeringkast
  document.getElementById('fFreeUnits').addEventListener('input', e => {
    _project.cabinet = _project.cabinet || {};
    const v = parseFloat(e.target.value);
    _project.cabinet.freeUnits = isNaN(v) ? null : v;
  });
  document.getElementById('fWiringDiameter').addEventListener('input', e => {
    _project.cabinet = _project.cabinet || {};
    const v = parseFloat(e.target.value);
    _project.cabinet.wiringDiameterMm2 = isNaN(v) ? null : v;
  });
  ['hasRemAutomaat','hasOutletNearFluvius','hasWifiNearFluvius','batteryPlacementRoom','hasWifiNearCabinet'].forEach(key => {
    document.querySelectorAll(`input[name="fCab_${key}"]`).forEach(r => {
      r.addEventListener('change', e => {
        _project.cabinet = _project.cabinet || {};
        _project.cabinet[key] = parseTriState(e.target.value);
      });
    });
  });
  document.querySelectorAll('input[name="lineGround"]').forEach(r => {
    r.addEventListener('change', e => {
      _project.cabinet = _project.cabinet || {};
      _project.cabinet.lineGroundChecked = e.target.value || null;
    });
  });
  document.querySelectorAll('input[name="fEarthResistanceMeasured"]').forEach(r => {
    r.addEventListener('change', e => {
      _project.technical = _project.technical || {};
      _project.technical.earthResistanceMeasured = parseTriState(e.target.value);
    });
  });
  document.getElementById('fEarthResistanceOhm').addEventListener('input', e => {
    _project.technical = _project.technical || {};
    _project.technical.earthResistanceOhm = readOptionalNumber(e.target.value);
  });
  document.getElementById('fEarthResistanceMeasuredDate').addEventListener('input', e => {
    _project.technical = _project.technical || {};
    _project.technical.earthResistanceMeasuredDate = e.target.value || null;
  });
  document.querySelectorAll('[data-voltage-field]').forEach(input => {
    input.addEventListener('input', e => {
      _project.technical = _project.technical || {};
      _project.technical.voltageMeasurements = _project.technical.voltageMeasurements || {};
      const key = e.target.getAttribute('data-voltage-field');
      const value = readOptionalNumber(e.target.value);
      if (value == null) delete _project.technical.voltageMeasurements[key];
      else _project.technical.voltageMeasurements[key] = value;
    });
  });
  document.getElementById('fTechnicalNotes').addEventListener('input', e => {
    _project.technical = _project.technical || {};
    _project.technical.technicalNotes = e.target.value;
  });
  attachSpeechToText(document.getElementById('fTechnicalNotes'), {
    title: 'Technische opmerkingen dicteren in het Nederlands',
    ariaLabel: 'Technische opmerkingen dicteren',
  });
  document.getElementById('fTechnicalNotes').addEventListener('speech-to-text-error', (e) => {
    showToast(e.detail && e.detail.message ? e.detail.message : 'Dicteren mislukt.', 'warning');
  });

  // Omvormer-lijst — per-entry input handlers
  document.querySelectorAll('[data-inv-field]').forEach(inp => {
    inp.addEventListener('input', e => {
      const invId = e.target.getAttribute('data-inv-id');
      const field = e.target.getAttribute('data-inv-field');
      const inv = _project.solar.inverters.find(i => i.id === invId);
      if (!inv) return;
      if (field === 'powerKw' || field === 'panelCount' || field === 'circuitCount') {
        const v = parseFloat(e.target.value);
        inv[field] = isNaN(v) ? null : v;
      } else {
        inv[field] = e.target.value;
      }
      if (field === 'powerKw') {
        rerenderBlokA();
        updateSaveCalcEnabled();
      }
    });
  });

  // Remove-inverter buttons
  document.querySelectorAll('[data-remove-inv]').forEach(btn => {
    btn.addEventListener('click', e => {
      const invId = e.currentTarget.getAttribute('data-remove-inv');
      _project.solar.inverters = _project.solar.inverters.filter(i => i.id !== invId);
      rerenderBlokC();
      rerenderBlokA();
      updateSaveCalcEnabled();
    });
  });

  // Add-inverter
  document.getElementById('fAddInverter').addEventListener('click', () => {
    _project.solar = _project.solar || { inverters: [] };
    _project.solar.inverters.push({
      id: genInverterId(), powerKw: null, brand: '', model: '',
      panelCount: null, circuitCount: null, orientation: '',
    });
    rerenderBlokC();
    rerenderBlokA();
  });

  // Collapse-state restoration + persistence (same pattern as Blok B)
  const header = document.querySelector('#blokC-slot .card-header');
  const body   = document.getElementById('blokC-body');
  if (_getCardCollapsed('C') === true) {
    body.classList.remove('show');
    header.setAttribute('aria-expanded', 'false');
  }
  header.addEventListener('click', () => {
    setTimeout(() => {
      _setCardCollapsed('C', !body.classList.contains('show'));
    }, 0);
  });
}

function rerenderBlokC() {
  document.getElementById('blokC-slot').innerHTML = sectionBlokC();
  wireBlokC();
}

function sectionOps() {
  const tasks = (_project.tasks || []).map(normalizeProjectTask);
  const activities = (_project.activities || []).map(normalizeProjectActivity);
  const nextActions = nextActionsForProject(_project);
  const taskRows = tasks.length ? tasks.map(t => `
    <div class="border rounded p-2 d-flex flex-column flex-md-row gap-2 align-items-md-center" data-task-id="${escapeHtml(t.id)}">
      <select class="form-select form-select-sm w-auto" data-task-field="status">
        ${['open','in_progress','done','cancelled'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s === 'open' ? 'Open' : s === 'in_progress' ? 'Bezig' : s === 'done' ? 'Gedaan' : 'Geannuleerd'}</option>`).join('')}
      </select>
      <input class="form-control form-control-sm flex-grow-1" data-task-field="title" value="${escapeHtml(t.title || '')}" placeholder="Taak" />
      <select class="form-select form-select-sm w-auto" data-task-field="assignee">
        <option value="" ${!t.assignee ? 'selected' : ''}>Nog toe te wijzen</option>
        <option value="kevin" ${t.assignee === 'kevin' ? 'selected' : ''}>Kevin</option>
        <option value="ruben" ${t.assignee === 'ruben' ? 'selected' : ''}>Ruben</option>
      </select>
      <input type="date" class="form-control form-control-sm w-auto" data-task-field="dueDate" value="${escapeHtml(t.dueDate || '')}" />
      <button type="button" class="btn btn-sm btn-outline-danger" data-task-delete="${escapeHtml(t.id)}" title="Taak verwijderen"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('') : '<p class="text-muted mb-0">Nog geen taken.</p>';
  const activityRows = activities.length ? activities.slice().reverse().map(a => `
    <div class="border-start border-3 ps-2 py-1">
      <div class="small text-muted">${escapeHtml(a.type)} · ${escapeHtml(a.occurredAt || 'geen datum')} · bron: ${escapeHtml(a.source || 'manual')} · ${escapeHtml(a.confidence || 'zeker')}</div>
      <div>${escapeHtml(a.title || a.notes || 'Activiteit')}</div>
    </div>`).join('') : '<p class="text-muted mb-0">Nog geen gestructureerde activiteiten.</p>';
  const suggestedRows = nextActions.length ? nextActions.map(a => `
    <button type="button" class="btn btn-sm btn-outline-primary me-1 mb-1" data-add-suggested-task="${escapeHtml(a.type)}" data-title="${escapeHtml(a.label)}" data-assignee="${escapeHtml(a.assignee || '')}">
      <i class="fa-solid fa-plus me-1"></i>${escapeHtml(a.label)}
    </button>`).join('') : '<span class="text-muted small">Geen automatische suggesties.</span>';
  return `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0"><i class="fa-solid fa-list-check text-primary me-2"></i>Opvolging &amp; tijdlijn</h5>
      </div>
      <div class="card-body">
        <div class="alert alert-info small">
          Taken zijn voorlopig bedoeld voor Kevin of Ruben. Onzekere info kan je hier bewust als taak/activiteit markeren in plaats van ze als feit te interpreteren.
        </div>
        <h6 class="text-muted">Volgende beste acties</h6>
        <div class="mb-3">${suggestedRows}</div>
        <h6 class="text-muted">Taken</h6>
        <div class="d-flex flex-column gap-2 mb-2" id="opsTaskList">${taskRows}</div>
        <button type="button" class="btn btn-sm btn-outline-primary" id="opsAddTask"><i class="fa-solid fa-plus me-1"></i>Taak toevoegen</button>
        <hr />
        <h6 class="text-muted">Tijdlijn / activiteiten</h6>
        <div class="d-flex flex-column gap-2 mb-2" id="opsActivityList">${activityRows}</div>
        <div class="row g-2">
          <div class="col-12 col-md-3">
            <select class="form-select form-select-sm" id="opsActivityType">
              <option value="phone_call">Telefoon</option>
              <option value="mail_sent">Mail verstuurd</option>
              <option value="mail_received">Mail ontvangen</option>
              <option value="appointment_scheduled">Afspraak gepland</option>
              <option value="site_visit">Plaatsbezoek</option>
              <option value="offer_sent">Offerte verzonden</option>
              <option value="installation_done">Installatie uitgevoerd</option>
              <option value="internal_note">Interne notitie</option>
            </select>
          </div>
          <div class="col-12 col-md-2"><input type="date" class="form-control form-control-sm" id="opsActivityDate" /></div>
          <div class="col-12 col-md"><input type="text" class="form-control form-control-sm" id="opsActivityTitle" placeholder="Korte omschrijving" /></div>
          <div class="col-12 col-md-auto"><button type="button" class="btn btn-sm btn-outline-primary w-100" id="opsAddActivity">Activiteit toevoegen</button></div>
        </div>
      </div>
    </div>
  `;
}

function rerenderOps() {
  const slot = document.getElementById('blokOps-slot');
  if (!slot) return;
  slot.innerHTML = sectionOps();
  wireOps();
}

function wireOps() {
  document.getElementById('opsAddTask')?.addEventListener('click', () => {
    _project.tasks = _project.tasks || [];
    _project.tasks.push(normalizeProjectTask({ title: '', assignee: 'kevin' }));
    rerenderOps();
  });
  document.querySelectorAll('[data-add-suggested-task]').forEach(btn => {
    btn.addEventListener('click', () => {
      _project.tasks = _project.tasks || [];
      _project.tasks.push(normalizeProjectTask({
        type: btn.getAttribute('data-add-suggested-task'),
        title: btn.getAttribute('data-title'),
        assignee: btn.getAttribute('data-assignee'),
        source: 'suggested',
      }));
      rerenderOps();
    });
  });
  document.querySelectorAll('[data-task-field]').forEach(el => {
    el.addEventListener('input', _updateTaskFromRow);
    el.addEventListener('change', _updateTaskFromRow);
  });
  document.querySelectorAll('[data-task-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-task-delete');
      _project.tasks = (_project.tasks || []).filter(t => t.id !== id);
      rerenderOps();
    });
  });
  document.getElementById('opsAddActivity')?.addEventListener('click', () => {
    const title = document.getElementById('opsActivityTitle')?.value.trim();
    if (!title) return;
    _project.activities = _project.activities || [];
    _project.activities.push(normalizeProjectActivity({
      type: document.getElementById('opsActivityType')?.value,
      occurredAt: document.getElementById('opsActivityDate')?.value || new Date().toISOString().slice(0, 10),
      title,
      source: 'manual',
    }));
    rerenderOps();
  });
}

function _updateTaskFromRow(e) {
  const row = e.target.closest('[data-task-id]');
  const id = row && row.getAttribute('data-task-id');
  const task = (_project.tasks || []).find(t => t.id === id);
  if (!task) return;
  task[e.target.getAttribute('data-task-field')] = e.target.value || null;
}

function sectionBlokD() {
  const serials = _project.serialNumbers || [];
  const serialRowsHtml = serials.map(s => _renderSerialRow(s)).join('')
                      + _renderSerialRow({ id: '_new', value: '', photoStoragePath: null }); // trailing empty

  return `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0"><i class="fa-solid fa-images text-primary me-2"></i>Foto's &amp; serienummers</h5>
      </div>
      <div class="card-body">
        <h6 class="text-muted mb-2">Foto's (plaatsbezoek &amp; serienummers)</h6>
        <div id="peBlokDPhotoUploader"></div>
        <hr class="my-3" />

        <h6 class="text-muted mb-2">Serienummers batterijen / omvormers</h6>
        <div id="peSerialList">${serialRowsHtml}</div>
      </div>
    </div>
  `;
}

function _renderSerialRow(entry) {
  if (entry.id === '_new') {
    return `
      <div class="serial-row" data-serial-id="_new">
        <input type="text" class="form-control serial-value" placeholder="Batterijserienummer toevoegen&hellip;" value="" data-serial-field="value" />
      </div>
    `;
  }
  const cat = entry.category || 'null';
  const status = entry.ocrStatus || 'ok';
  const isPending = status === 'pending';
  const isFailed  = status === 'failed';
  const isOcr     = entry.source === 'ocr';
  const placeholder = isPending
    ? 'OCR bezig...'
    : (isFailed ? 'OCR niet gelukt, vul manueel in' : 'Serienummer');

  const statusIconHtml = isPending
    ? `<i class="fa-solid fa-spinner fa-spin serial-status-icon" title="OCR bezig"></i>`
    : (isFailed
        ? `<i class="fa-solid fa-triangle-exclamation serial-status-icon icon-warn" title="OCR niet gelukt"></i>`
        : `<i class="fa-solid fa-circle-check serial-status-icon icon-ok" title="OK"></i>`);

  const sourceIconHtml = isOcr
    ? `<button type="button" class="serial-action-btn serial-photo-link" data-photo-id="${escapeHtml(entry.photoId || '')}" title="Toon bronfoto"><i class="fa-solid fa-image"></i></button>`
    : `<span class="serial-status-icon"><i class="fa-solid fa-keyboard text-muted" title="Manueel ingevoerd"></i></span>`;

  const rerunBtnHtml = (isOcr && isFailed)
    ? `<button type="button" class="serial-action-btn serial-rerun-btn" data-photo-id="${escapeHtml(entry.photoId || '')}" title="OCR opnieuw proberen"><i class="fa-solid fa-rotate"></i></button>`
    : '';
  const bebatStatus = entry.bebatStatus || (cat === 'batterij' || cat === 'omvormer_batterij' ? 'pending' : 'not_required');

  return `
    <div class="serial-row flex-wrap" data-serial-id="${escapeHtml(entry.id)}">
      <select class="form-select form-select-sm w-auto" data-serial-field="category" title="Type serienummer">
        <option value="batterij" ${cat === 'batterij' ? 'selected' : ''}>Batterij</option>
        <option value="omvormer" ${cat === 'omvormer' ? 'selected' : ''}>Omvormer</option>
        <option value="omvormer_batterij" ${cat === 'omvormer_batterij' ? 'selected' : ''}>Omv.+bat.</option>
        <option value="" ${cat === 'null' ? 'selected' : ''}>?</option>
      </select>
      ${statusIconHtml}
      ${sourceIconHtml}
      <input type="text" class="form-control form-control-sm serial-value"
             value="${escapeHtml(entry.value || '')}"
             placeholder="${escapeHtml(placeholder)}"
             data-serial-field="value"
             ${isPending ? 'readonly' : ''} />
      <select class="form-select form-select-sm w-auto" data-serial-field="bebatStatus" title="Bebat-status">
        <option value="pending" ${bebatStatus === 'pending' ? 'selected' : ''}>Bebat: nog</option>
        <option value="registered" ${bebatStatus === 'registered' ? 'selected' : ''}>Bebat: geregistreerd</option>
        <option value="not_required" ${bebatStatus === 'not_required' ? 'selected' : ''}>Bebat: n.v.t.</option>
      </select>
      ${rerunBtnHtml}
      <button type="button" class="serial-action-btn serial-delete-btn" data-serial-delete="${escapeHtml(entry.id)}" title="Verwijderen"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
}

function wireBlokD() {
  // Photo uploader (shared component)
  const uploaderHost = document.getElementById('peBlokDPhotoUploader');
  if (uploaderHost) {
    if (_blokDUploader) {
      try { _blokDUploader.destroy(); } catch {}
      _blokDUploader = null;
    }
    _blokDUploader = mountPhotoUploader(uploaderHost, {
      projectId: PROJECT_ID || null,
      onChange: null,
    });
  }

  // Serials — value/category/Bebat typing
  document.querySelectorAll('[data-serial-field]').forEach(inp => {
    inp.addEventListener('input', async e => {
      const row = e.target.closest('.serial-row');
      const id  = row.getAttribute('data-serial-id');
      const field = e.target.getAttribute('data-serial-field');
      const val = e.target.value;
      if (id === '_new' && field === 'value' && val.trim().length > 0) {
        // Promote trailing empty to a real entry + add new trailing.
        if (!PROJECT_ID) {
          // New-project mode: stash on _project, save at createProject-time.
          _project.serialNumbers = _project.serialNumbers || [];
          const entry = { id: _genSerialId(), value: val, category: 'batterij', source: 'manual', bebatStatus: 'pending', bebatRegisteredAt: null, bebatReference: null, photoStoragePath: null, uploadedAt: null, uploadedBy: null };
          _project.serialNumbers.push(entry);
          rerenderBlokD();
          rerenderOps();
          // Focus what used to be the trailing input (now the last real row)
          setTimeout(() => {
            const rows = document.querySelectorAll('#peSerialList .serial-row');
            const last = rows[rows.length - 2];
            if (last) last.querySelector('input').focus();
          }, 0);
        } else {
          try {
            const entry = await addProjectSerial(PROJECT_ID, val);
            _project.serialNumbers = _project.serialNumbers || [];
            _project.serialNumbers.push(entry);
            rerenderBlokD();
            rerenderOps();
          } catch (err) {
            showToast('Serienummer toevoegen mislukt: ' + (err && err.message ? err.message : String(err)), 'danger');
          }
        }
      } else if (id !== '_new') {
        const entry = (_project.serialNumbers || []).find(x => x.id === id);
        if (entry) {
          entry[field] = field === 'category' && !val ? null : val;
          if (field === 'category' && val === 'omvormer' && !entry.bebatStatus) entry.bebatStatus = 'not_required';
          if (field === 'category' && (val === 'batterij' || val === 'omvormer_batterij') && (!entry.bebatStatus || entry.bebatStatus === 'not_required')) entry.bebatStatus = 'pending';
        }
        if (!_serialSaveTimer) _serialSaveTimer = {};
        if (!_serialSavePatch) _serialSavePatch = {};
        const patch = _serialSavePatch[id] || {};
        patch[field] = field === 'category' && !val ? null : val;
        if (entry && field === 'category') patch.bebatStatus = entry.bebatStatus;
        _serialSavePatch[id] = patch;
        clearTimeout(_serialSaveTimer[id]);
        _serialSaveTimer[id] = setTimeout(async () => {
          const patchToSave = { ...(_serialSavePatch && _serialSavePatch[id] ? _serialSavePatch[id] : {}) };
          if (_serialSavePatch) delete _serialSavePatch[id];
          if (!Object.keys(patchToSave).length) return;
          if (PROJECT_ID) {
            try { await updateProjectSerial(PROJECT_ID, id, patchToSave); }
            catch (err) { showToast('Opslaan mislukt: ' + (err && err.message ? err.message : String(err)), 'danger'); }
          }
          if ('category' in patchToSave || 'bebatStatus' in patchToSave) rerenderOps();
        }, 600);
      }
    });
    inp.addEventListener('change', e => e.target.dispatchEvent(new Event('input', { bubbles: true })));
  });

  // Serial delete
  document.querySelectorAll('[data-serial-delete]').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.currentTarget.getAttribute('data-serial-delete');
      const ok = await showConfirm({
        title: 'Serienummer verwijderen?',
        message: 'Dit serienummer wordt uit het project verwijderd.',
        confirmText: 'Serienummer verwijderen',
        variant: 'danger',
      });
      if (!ok) return;
      if (PROJECT_ID) {
        try { await deleteProjectSerial(PROJECT_ID, id); }
        catch (err) { showToast('Verwijderen mislukt: ' + (err && err.message ? err.message : String(err)), 'danger'); return; }
      }
      _project.serialNumbers = (_project.serialNumbers || []).filter(x => x.id !== id);
      rerenderBlokD();
      rerenderOps();
    });
  });

  // Re-run knop + photo-link click delegation (Task 8).
  const serialList = document.getElementById('peSerialList');
  if (serialList) {
    serialList.addEventListener('click', async (e) => {
      const rerunBtn = e.target.closest('.serial-rerun-btn');
      if (rerunBtn) {
        const photoId = rerunBtn.getAttribute('data-photo-id');
        if (!photoId || !PROJECT_ID) return;
        rerunBtn.disabled = true;
        try {
          await window.requestPhotoOcrRerun(PROJECT_ID, photoId);
          showToast('OCR opnieuw gestart', 'primary');
        } catch (err) {
          showToast('Re-run mislukt: ' + (err && err.message ? err.message : String(err)), 'danger');
        } finally {
          rerunBtn.disabled = false;
        }
        return;
      }
      const photoLink = e.target.closest('.serial-photo-link');
      if (photoLink) {
        const photoId = photoLink.getAttribute('data-photo-id');
        if (photoId && _blokDUploader && typeof _blokDUploader.openByPhotoId === 'function') {
          _blokDUploader.openByPhotoId(photoId);
        }
      }
    });
  }

}

function _snapshotSerialInputs() {
  const active = document.activeElement;
  const activeRow = active && active.closest ? active.closest('#peSerialList .serial-row') : null;
  const values = {};
  document.querySelectorAll('#peSerialList .serial-row').forEach(row => {
    const input = row.querySelector('[data-serial-field="value"]');
    const id = row.getAttribute('data-serial-id');
    if (id && input) values[id] = input.value;
  });
  return {
    values,
    activeId: activeRow ? activeRow.getAttribute('data-serial-id') : null,
    selectionStart: active && typeof active.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function _restoreSerialInputs(snapshot) {
  if (!snapshot) return;
  Object.entries(snapshot.values || {}).forEach(([id, value]) => {
    const row = document.querySelector(`#peSerialList .serial-row[data-serial-id="${CSS.escape(id)}"]`);
    const input = row && row.querySelector('[data-serial-field="value"]');
    if (input) input.value = value;
  });
  if (snapshot.activeId) {
    const row = document.querySelector(`#peSerialList .serial-row[data-serial-id="${CSS.escape(snapshot.activeId)}"]`);
    const input = row && row.querySelector('[data-serial-field="value"]');
    if (input) {
      input.focus();
      if (snapshot.selectionStart != null && snapshot.selectionEnd != null) {
        input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      }
    }
  }
}

function rerenderBlokD(opts = {}) {
  const snapshot = opts.preserveSerialInputs ? _snapshotSerialInputs() : null;
  document.getElementById('blokD-slot').innerHTML = sectionBlokD();
  wireBlokD();
  _restoreSerialInputs(snapshot);
}

let _blokDUploader    = null;
let _serialSaveTimer  = null;
let _serialSavePatch  = null;
let _pendingCsv       = null;


// Tri-state radio helper: returns HTML for three labels (Ja/Nee/Onbekend).
// `name` is unique in the DOM; `value` is the current stored state (null|true|false).
function triStateHtml(name, value) {
  const mk = (v, label) => {
    const match = (v === null ? value === null : value === v);
    const strV = v === null ? 'unknown' : String(v);
    const fid = `${name}_${strV}`;
    return `<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="${name}" value="${strV}" id="${fid}" ${match ? 'checked' : ''} /><label class="form-check-label" for="${fid}">${label}</label></div>`;
  };
  return `
    <div>
      ${mk(true,  'Ja')}
      ${mk(false, 'Nee')}
      ${mk(null,  'Onbekend')}
    </div>
  `;
}

function parseTriState(strVal) {
  if (strVal === 'true')  return true;
  if (strVal === 'false') return false;
  return null;
}


function genInverterId() {
  return 'inv_' + Math.random().toString(36).slice(2, 10);
}



function wireActions() {
  document.getElementById('btnSave').addEventListener('click', () => save({ andCalc: false }));
  document.getElementById('btnSaveAndCalc').addEventListener('click', () => save({ andCalc: true }));
}

function updateSaveCalcEnabled() {
  // Informatief: tooltip toont nog wat ontbreekt, maar blokkeert de click niet.
  // Hard-required velden (klantnaam, omvormer powerKw) worden in collectFromForm
  // alsnog afgedwongen; overige fallback-velden kunnen in de calc view ingevuld
  // worden (applyProjectToCalcForm + buildProjectSyncPatch propagate terug).
  const missing = _missingCalcFields();
  const btn = document.getElementById('btnSaveAndCalc');
  if (!btn) return;
  btn.disabled = false;
  btn.title = missing.length === 0
    ? 'Alles aanwezig — klaar om te berekenen'
    : 'Tip — nog niet ingevuld: ' + missing.join(', ');
}

function _missingCalcFields() {
  const miss = [];
  if (!((_project.customerName || '').trim())) miss.push('klantnaam');
  const totalKw = ((_project.solar && _project.solar.inverters) || [])
    .reduce((s, i) => s + (Number(i.powerKw) || 0), 0);
  if (totalKw <= 0) miss.push('omvormer-vermogen');
  const sup = _project.supplier || {};
  if (!(sup.priceDay > 0)) miss.push('prijs dag');
  if (sup.isSingleTariff === false && !(sup.priceNight > 0)) miss.push('prijs nacht');
  const hasCsv = _pendingCsv || (_project.csvUpload && _project.csvUpload.dailyCompact);
  if (!hasCsv) miss.push('CSV');
  return miss;
}

// Gather the save payload from _project. Extracted so later sections all just
// mutate _project on input and the save flow reads the full object uniformly.
function collectFromForm() {
  // Basisgegevens
  const projectName  = (_project.projectName  || '').trim();
  const customerName = (_project.customerName || '').trim();

  const errors = {};  // { fieldId-or-key: { msg, invId? } }
  if (!customerName) errors.fCustomerName = { msg: 'Klantnaam is verplicht.' };

  // Inverter bounds (mirrors VALIDATION_BOUNDS in calc-engine.js)
  const INV_KW_MAX = 100;
  for (let i = 0; i < _project.solar.inverters.length; i++) {
    const inv = _project.solar.inverters[i];
    const kw = Number(inv.powerKw);
    if (!(kw > 0)) {
      errors[`inv_powerKw_${inv.id}`] = {
        msg: `Omvormer ${i + 1}: vermogen (kW) is verplicht als de omvormer in de lijst staat.`,
        invId: inv.id,
      };
    } else if (kw > INV_KW_MAX) {
      errors[`inv_powerKw_${inv.id}`] = {
        msg: `Omvormer ${i + 1}: vermogen (${kw} kW) lijkt onrealistisch (max ${INV_KW_MAX} kW).`,
        invId: inv.id,
      };
    }
  }

  // Price bounds (mirrors VALIDATION_BOUNDS in calc-engine.js)
  const PRICE_MAX = 2.00;
  const priceDay = Number(_project.supplier?.priceDay);
  const priceNight = Number(_project.supplier?.priceNight);
  if (!isNaN(priceDay) && priceDay > 0 && priceDay > PRICE_MAX) {
    errors.fPriceDay = { msg: `Dagtarief (${priceDay} €/kWh) lijkt onrealistisch (max ${PRICE_MAX} €/kWh).` };
  }
  if (!isNaN(priceNight) && priceNight > 0 && priceNight > PRICE_MAX) {
    errors.fPriceNight = { msg: `Nachttarief (${priceNight} €/kWh) lijkt onrealistisch (max ${PRICE_MAX} €/kWh).` };
  }

  if (Object.keys(errors).length > 0) {
    const err = new Error('Sommige velden zijn verplicht of ongeldig.');
    err.fieldErrors = errors;
    throw err;
  }

  const metadata = {
    customer:      _project.customer,
    situation:     _project.situation,
    notes:         _project.notes,
    planning:      _project.planning,
    site:          _project.site,
    electrical:    _project.electrical,
    cabinet:       _project.cabinet,
    solar:         _project.solar,
    technical:     _project.technical,
    inspection:    _project.inspection,
    supplier:      _project.supplier,
    calcDefaults:  _project.calcDefaults,
    activities:    (_project.activities || []).map(normalizeProjectActivity),
    tasks:         (_project.tasks || []).map(normalizeProjectTask).filter(t => t.title),
    mailLinks:     _project.mailLinks || [],
    filesInbox:    _project.filesInbox || [],
    batteryRegistry: _project.batteryRegistry || { bebatStatus: 'not_needed', entries: [] },
    serialNumbers: _project.serialNumbers || [],
  };
  return { projectName, customerName, status: _project.status || DEFAULT_STATUS, metadata };
}

async function save({ andCalc }) {
  // Clear previous field-level errors before each attempt
  ['fProjectName', 'fCustomerName', 'fPriceDay', 'fPriceNight'].forEach(clearFieldError);
  // Clear any inverter powerKw errors
  document.querySelectorAll('[data-inv-field="powerKw"].is-invalid').forEach(el => {
    el.classList.remove('is-invalid');
  });
  clearError();
  const btnSave = document.getElementById('btnSave');
  const btnSC   = document.getElementById('btnSaveAndCalc');
  btnSave.disabled = true; btnSC.disabled = true;
  const prevLabel = btnSave.textContent;
  btnSave.textContent = 'Bezig…';

  showSpinner({ message: 'Project opslaan…' });
  try {
    const payload = collectFromForm();
    let targetId;
    if (IS_NEW) {
      const ref = await createProject({
        projectName:  payload.projectName,
        customerName: payload.customerName,
        status:       payload.status,
        csvData:      _pendingCsv,
        metadata:     payload.metadata,
      });
      targetId = ref.id;
    } else {
      await updateProjectMetadata(PROJECT_ID, {
        projectName:  payload.projectName,
        customerName: payload.customerName,
        status:       payload.status,
        ...payload.metadata,
      });
      if (_pendingCsv) {
        await setProjectCsv(PROJECT_ID, _pendingCsv);
        _pendingCsv = null;
      }
      targetId = PROJECT_ID;
    }
    // If the house-age (→ BTW) changed since load, always route through the
    // calc view so the cached ROI is recomputed with the new BTW rate.
    const currentHouseAge = (_project.site && _project.site.houseAgeOver10Years !== undefined)
      ? _project.site.houseAgeOver10Years : null;
    const houseAgeChanged = currentHouseAge !== _initialHouseAge;
    if (andCalc || houseAgeChanged) {
      window.location.href = `index.html?project=${targetId}#results`;
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (e) {
    hideSpinner();
    if (e.fieldErrors) {
      let firstEl = null;
      for (const [key, { msg, invId }] of Object.entries(e.fieldErrors)) {
        if (invId) {
          // Per-inverter powerKw: highlight via data-attribute selector
          const inputEl = document.querySelector(`[data-inv-field="powerKw"][data-inv-id="${invId}"]`);
          if (inputEl) {
            inputEl.classList.add('is-invalid');
            if (!firstEl) firstEl = inputEl;
          }
        } else {
          showFieldError(key, msg);
          if (!firstEl) firstEl = document.getElementById(key);
        }
      }
      if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showError(e && e.message ? e.message : String(e));
    btnSave.disabled = false; btnSC.disabled = false;
    btnSave.textContent = prevLabel;
  }
}

