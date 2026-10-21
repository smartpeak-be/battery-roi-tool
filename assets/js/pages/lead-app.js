import { escapeHtml, showToast, withSpinner } from '../shared-helpers.js';
import { validateCsvHeaders } from '../csv.js';
import { csvToAllDaysAndMeta, parseSheetConfigs } from '../calc-engine.js';
import { resolveLeadInputs, selectBestConfigs, buildLeadResult, buildDefaultsNotes } from '../lead-calc.js';
import { extractCsvForStorage } from '../csv.js';

// ─── STATE ──────────────────────────────────────────────────────────────
let _csvText = null;
let _allDaysResult = null;  // { allDays, eanCode, meterNr, meterType }
let _currentStep = 1;

// ─── WIZARD NAVIGATION ─────────────────────────────────────────────────

function goToStep(n) {
  _currentStep = n;
  document.querySelectorAll('.sp-wizard-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.sp-wizard-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === n);
    dot.classList.toggle('done', i + 1 < n);
  });
}

// Back buttons
document.querySelectorAll('.btnBack').forEach(btn => {
  btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.back)));
});

// ─── STEP 1: CSV ────────────────────────────────────────────────────────

const dropZone = document.getElementById('csvDropZone');
const fileInput = document.getElementById('csvFileInput');
const feedback  = document.getElementById('csvFeedback');
const btnNext1  = document.getElementById('btnStep1Next');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleCsvFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleCsvFile(fileInput.files[0]);
});

function handleCsvFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    feedback.className = 'sp-csv-feedback error';
    feedback.textContent = 'Selecteer een CSV-bestand (.csv).';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const validation = validateCsvHeaders(text);
    if (!validation.valid) {
      feedback.className = 'sp-csv-feedback error';
      feedback.innerHTML = escapeHtml(validation.errors.join(' '));
      _csvText = null;
      _allDaysResult = null;
      btnNext1.disabled = true;
      return;
    }
    try {
      _allDaysResult = csvToAllDaysAndMeta(text);
      _csvText = text;
    } catch (e) {
      feedback.className = 'sp-csv-feedback error';
      feedback.textContent = e.message || 'Fout bij verwerken van CSV.';
      _csvText = null;
      _allDaysResult = null;
      btnNext1.disabled = true;
      return;
    }
    const days = _allDaysResult.allDays.length;
    if (days < 365) {
      feedback.className = 'sp-csv-feedback warning';
      feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> CSV geladen — ${days} dagen verbruiksdata. Minder dan 1 jaar: resultaat wordt geschat op basis van beschikbare periode.`;
    } else {
      feedback.className = 'sp-csv-feedback success';
      feedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> CSV geladen — ${days} dagen verbruiksdata gevonden.`;
    }
    btnNext1.disabled = false;
  };
  reader.readAsText(file);
}

btnNext1.addEventListener('click', () => goToStep(2));

// ─── STEP 2: CONTACT ───────────────────────────────────────────────────

document.getElementById('btnStep2Next').addEventListener('click', () => {
  const name  = document.getElementById('leadName');
  const email = document.getElementById('leadEmail');
  let valid = true;
  if (!name.value.trim()) { name.classList.add('is-invalid'); valid = false; } else { name.classList.remove('is-invalid'); }
  if (!email.value.trim() || !email.validity.valid) { email.classList.add('is-invalid'); valid = false; } else { email.classList.remove('is-invalid'); }
  if (valid) goToStep(3);
});

// ─── STEP 3: SUBMIT ────────────────────────────────────────────────────

document.getElementById('btnSubmit').addEventListener('click', async () => {
  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = true;

  try {
    await withSpinner(async () => {
      // 1. Initialize Firebase (no auth needed for leads)
      initFirebase();

      // 2. Resolve inputs with defaults
      const houseAgeRadio = document.querySelector('input[name="houseAge"]:checked');
      const rawInputs = {
        pvInverterKw: parseFloat(document.getElementById('leadPvKw').value) || 0,
        pricePerKwh:  parseFloat(document.getElementById('leadPrice').value) || 0,
        houseAgeOver10Years: houseAgeRadio ? houseAgeRadio.value === 'true' : null
      };
      const resolved = resolveLeadInputs(rawInputs);

      // 3. Fetch product configs
      const cfg = await getProductsConfig();
      if (!cfg || !cfg.csvUrl) throw new Error('Productconfiguratie niet beschikbaar.');
      const resp = await fetch(cfg.csvUrl);
      if (!resp.ok) throw new Error('Kon productlijst niet ophalen.');
      const configs = parseSheetConfigs(await resp.text());
      if (!configs.length) throw new Error('Geen batterij-configuraties gevonden.');

      // 4. Calculate best ROI (top 2 Zendure configs)
      const bestConfigs = selectBestConfigs(
        _allDaysResult.allDays, configs,
        resolved.pvInverterKw, resolved.pricePerKwh, resolved.effectiveBtw
      );

      // 5. Build lead document
      const csvStorage = extractCsvForStorage(_csvText);
      const notes = buildDefaultsNotes(resolved.defaultsUsed);
      const leadDoc = {
        customerName:       document.getElementById('leadName').value.trim(),
        email:              document.getElementById('leadEmail').value.trim(),
        csvDailyCompact:    csvStorage.dailyCompact,
        pvInverterKw:       resolved.pvInverterKw,
        pricePerKwh:        resolved.pricePerKwh,
        houseAgeOver10Years: rawInputs.houseAgeOver10Years,
        defaultsUsed:       resolved.defaultsUsed,
        notes:              notes,
        result:             bestConfigs.length ? buildLeadResult(bestConfigs) : null,
        effectiveBtw:       resolved.effectiveBtw,
        keuring:            true
      };

      // 6. Save to Firestore
      await createLead(leadDoc);

      // 7. The result mail is queued by the leadMailsOnCreate Cloud Function.

      // 8. Show confirmation
      document.getElementById('confirmEmail').textContent = leadDoc.email;
      goToStep(4);
    }, { message: 'Berekening uitvoeren...' });
  } catch (e) {
    showToast('Er ging iets mis: ' + (e.message || e), 'danger');
    btnSubmit.disabled = false;
  }
});

