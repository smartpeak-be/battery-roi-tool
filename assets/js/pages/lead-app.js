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
      const leadId = await createLead(leadDoc);

      // 7. Send result email
      const resultUrl = `${window.location.origin}${window.location.pathname.replace('lead.html', 'lead-result.html')}?r=${leadId}`;

      // Build defaults disclaimer
      const du = leadDoc.defaultsUsed || {};
      const defItems = [];
      if (du.pvInverterKw)       defItems.push('omvormervermogen (3,5 kW)');
      if (du.pricePerKwh)        defItems.push('energiekost (0,34 EUR/kWh)');
      if (du.houseAgeOver10Years) defItems.push('BTW-tarief (21%)');
      const disclaimerBlock = defItems.length ? `
        <tr><td style="padding:0 32px 24px">
          <div style="background:#f8f9fa;border-radius:10px;padding:14px 18px;color:#495057;font-size:13px;line-height:1.5">
            Deze berekening is gebaseerd op jouw verbruiksdata, aangevuld met gemiddelde waarden voor <strong>${defItems.join(', ')}</strong>.
            Voor een nauwkeurigere analyse op maat van jouw situatie nemen we graag contact op.
          </div>
        </td></tr>` : '';

      await createMailDoc({
        kind: 'lead_result',
        leadId,
        to: leadDoc.email,
        message: {
          subject: 'Je batterij-analyse is klaar — SmartPeak',
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
  <!-- Header -->
  <tr><td style="padding:28px 32px 16px">
    <span style="font-size:22px;font-weight:700;color:#2c7be5">SmartPeak</span><br>
    <span style="font-size:13px;color:#6b7a8d">Slim omgaan met jouw energie</span>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 0">
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:8px 32px 0;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 16px">Hallo ${escapeHtml(leadDoc.customerName)},</p>
    <p style="margin:0 0 16px">Bedankt dat je gebruik hebt gemaakt van onze gratis batterij-analyse tool! Op basis van jouw Fluvius-data hebben we een persoonlijke analyse voor je klaarstaan.</p>
  </td></tr>
  <!-- CTA -->
  <tr><td align="center" style="padding:8px 32px 24px">
    <a href="${resultUrl}" style="display:inline-block;padding:14px 28px;background:#2c7be5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Bekijk mijn resultaat</a>
  </td></tr>
  <!-- Defaults disclaimer -->
  ${disclaimerBlock}
  <!-- Closing -->
  <tr><td style="padding:0 32px 24px;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 8px">Heb je vragen of wil je meer weten? Aarzel niet om contact met ons op te nemen!</p>
    <p style="margin:0;color:#6b7a8d">Met vriendelijke groeten,<br>Het SmartPeak team</p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f0f2f5;padding:20px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7a8d;line-height:1.5">
      <strong style="color:#4a5a70">SmartPeak</strong> &middot; Slim omgaan met jouw energie<br>
      <a href="tel:+32485606840" style="color:#6b7a8d;text-decoration:none">+32 485 60 68 40</a> &middot;
      <a href="mailto:info@smartpeak.be" style="color:#6b7a8d;text-decoration:none">info@smartpeak.be</a> &middot;
      <a href="https://smartpeak.be" style="color:#6b7a8d;text-decoration:none">smartpeak.be</a>
    </p>
    <hr style="border:none;border-top:1px solid #dde1e6;margin:12px 0">
    <p style="margin:0;font-size:11px;color:#adb5bd;line-height:1.4">Blox-it BV &middot; BE0730.696.050</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
        }
      });

      // 8. Show confirmation
      document.getElementById('confirmEmail').textContent = leadDoc.email;
      goToStep(4);
    }, { message: 'Berekening uitvoeren...' });
  } catch (e) {
    showToast('Er ging iets mis: ' + (e.message || e), 'danger');
    btnSubmit.disabled = false;
  }
});

