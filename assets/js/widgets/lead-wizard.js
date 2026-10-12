// SmartPeak verbruiksanalyse as an embeddable widget (the lead.html wizard, without Bootstrap,
// the Firebase SDK or any key). Same calculation, same lead and same result mail as lead.html.
//
// Embed:
//   <div id="smartpeak-analyse"
//        data-help-url="https://smartpeak.be/hulp/p1-poort-activeren/#verbruik-downloaden"
//        data-privacy-url="https://smartpeak.be/privacyverklaring/"
//        data-email="info@smartpeak.be"></div>
//   <script type="module" src="https://smartpeak-be.github.io/battery-roi-tool/assets/js/widgets/lead-wizard.js"></script>
//
// Optional data attributes on the mount element:
//   data-source         where the lead came from (default: the page path), noted on the lead
//   data-heading-level  heading level for the step titles (default 3)
//   data-firestore      Firestore REST base URL (tests only, e.g. the emulator)
// Styling: the widget injects a small default stylesheet driven by CSS custom properties
// (--spa-accent, --spa-ink, --spa-line, ...), so the host page can restyle it.

import { readConsumptionCsv, loadProductConfigs, submitLeadAnalysis, FIRESTORE_URL } from '../lead-submit.js';
import { LEAD_DEFAULTS } from '../lead-calc.js';

const RESULT_PAGE_URL = new URL('../../../lead-result.html', import.meta.url).href;
const STYLE_ID = 'spa-lead-wizard-css';

const CSS = `
.spa{--spa-accent:#17c15c;--spa-accent-deep:#0b7a42;--spa-ink:#1f272e;--spa-soft:#4b5661;--spa-line:#d9e3df;--spa-paper:#f3f7f5;--spa-focus:#0a6a78;--spa-error:#c2412d;--spa-radius:14px;--spa-radius-l:22px;
  color:var(--spa-ink);font:inherit;border:1px solid var(--spa-line);border-radius:var(--spa-radius-l);background:#fff;padding:clamp(1.25rem,3vw,2rem);margin:1.5rem 0}
.spa *,.spa *::before,.spa *::after{box-sizing:border-box}
.spa .spa-steps{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin:0 0 1.5rem;padding:0;font-size:.92rem;color:var(--spa-soft)}
.spa .spa-steps li{display:flex;align-items:center;gap:.5rem;margin:0}
.spa .spa-steps li::marker{content:none}
.spa .spa-steps .spa-num{display:inline-grid;place-items:center;width:1.9rem;height:1.9rem;border-radius:50%;border:1.5px solid var(--spa-line);font-weight:600;background:#fff}
.spa .spa-steps .is-active{color:var(--spa-ink);font-weight:600}
.spa .spa-steps .is-active .spa-num{background:var(--spa-ink);border-color:var(--spa-ink);color:#fff}
.spa .spa-steps .is-done .spa-num{background:var(--spa-accent-deep);border-color:var(--spa-accent-deep);color:#fff}
.spa .spa-step{display:grid;gap:1.1rem}
.spa .spa-step[hidden]{display:none}
.spa .spa-title{margin:0;font-size:1.3rem;line-height:1.3}
.spa .spa-title:focus{outline:none}
.spa .spa-text{margin:0;color:var(--spa-soft)}
.spa .spa-drop{position:relative;display:grid;justify-items:center;gap:.35rem;text-align:center;padding:2rem 1rem;border:2px dashed #b9c9c3;border-radius:var(--spa-radius);background:var(--spa-paper);cursor:pointer;transition:border-color .15s,background-color .15s}
.spa .spa-drop:hover,.spa .spa-drop.is-over{border-color:var(--spa-accent);background:#e9f8ef}
.spa .spa-drop:focus-within{outline:3px solid var(--spa-focus);outline-offset:2px}
.spa .spa-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.spa .spa-drop svg{width:2.2rem;height:2.2rem;color:var(--spa-accent-deep)}
.spa .spa-drop-sub{font-size:.92rem;color:var(--spa-soft)}
.spa .spa-msg{margin:0;padding:.85rem 1rem;border-radius:var(--spa-radius);font-size:.97rem}
.spa .spa-msg[hidden]{display:none}
.spa .spa-msg-ok{background:#e3f7ea;color:#0b5a31}
.spa .spa-msg-warn{background:#fff4dc;color:#6b4a00}
.spa .spa-msg-error{background:#fdecea;color:#8a2414}
.spa .spa-field{display:grid;gap:.35rem}
.spa .spa-field label,.spa .spa-legend{font-weight:600}
.spa .spa-optional{font-weight:400;color:var(--spa-soft)}
.spa .spa-help{font-size:.92rem;color:var(--spa-soft);margin:0}
.spa .spa-field input[type=text],.spa .spa-field input[type=email]{width:100%;font:inherit;color:var(--spa-ink);background:#fff;border:1.5px solid #c9d5d1;border-radius:8px;padding:.7rem .8rem;min-height:3rem}
.spa .spa-field input:focus-visible{outline:3px solid var(--spa-focus);outline-offset:1px;border-color:var(--spa-focus)}
.spa .spa-field input[aria-invalid=true]{border-color:var(--spa-error)}
.spa .spa-error{color:var(--spa-error);font-size:.92rem;margin:0}
.spa .spa-error[hidden]{display:none}
.spa .spa-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.1rem}
.spa fieldset{border:0;margin:0;padding:0;min-width:0}
.spa .spa-choices{display:grid;gap:.4rem;margin-top:.35rem}
.spa .spa-field .spa-choice{display:flex;align-items:center;gap:.6rem;font-weight:400}
.spa .spa-choice input{width:1.15rem;height:1.15rem;accent-color:var(--spa-accent-deep);margin:0}
.spa .spa-nav{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.25rem}
.spa .spa-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:3rem;padding:.7rem 1.4rem;border-radius:999px;border:2px solid var(--spa-ink);background:var(--spa-ink);color:#fff;font:inherit;font-weight:600;line-height:1.2;cursor:pointer;text-decoration:none;transition:background-color .15s,color .15s}
.spa .spa-btn:hover:not(:disabled){background:var(--spa-accent-deep);border-color:var(--spa-accent-deep);color:#fff}
.spa .spa-btn:focus-visible{outline:3px solid var(--spa-focus);outline-offset:2px}
.spa .spa-btn:disabled{opacity:.45;cursor:not-allowed}
.spa .spa-btn-ghost{background:transparent;color:var(--spa-ink)}
.spa .spa-btn-ghost:hover:not(:disabled){background:var(--spa-ink);border-color:var(--spa-ink);color:#fff}
.spa .spa-spinner{width:1.1rem;height:1.1rem;border-radius:50%;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;animation:spa-spin .8s linear infinite}
.spa .spa-done{text-align:center;justify-items:center;padding:1rem 0}
.spa .spa-done svg{width:3.2rem;height:3.2rem;color:var(--spa-accent-deep)}
.spa a{color:inherit}
@keyframes spa-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spa .spa-spinner{animation-duration:2.4s}}
@media (max-width:560px){.spa .spa-row{grid-template-columns:1fr}.spa .spa-nav .spa-btn{flex:1 1 auto}}
`;

const ICON_UPLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/><circle cx="18" cy="17" r="4" fill="#fff"/><path d="m16.3 17 1.2 1.2 2.2-2.4"/></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (n) => String(n).replace('.', ',');

function injectCss() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  // Before the host stylesheets, so the host page can override the defaults.
  document.head.prepend(style);
}

function template(cfg, uid) {
  const h = `h${cfg.headingLevel}`;
  const id = (name) => `${uid}-${name}`;
  const help = cfg.helpUrl ? ` <a href="${esc(cfg.helpUrl)}">Hoe download je dat bestand?</a>` : '';
  const privacy = cfg.privacyUrl ? ` Meer daarover in onze <a href="${esc(cfg.privacyUrl)}">privacyverklaring</a>.` : '';
  return `
<ol class="spa-steps" aria-label="Stappen">
  <li class="is-active" data-dot="1"><span class="spa-num">1</span>Verbruik</li>
  <li data-dot="2"><span class="spa-num">2</span>Jouw gegevens</li>
  <li data-dot="3"><span class="spa-num">3</span>Extra info</li>
</ol>

<section class="spa-step" data-step="1" aria-labelledby="${id('t1')}">
  <${h} class="spa-title" id="${id('t1')}" tabindex="-1">Laad je verbruik op</${h}>
  <p class="spa-text">Download in Mijn Fluvius je verbruiksgegevens als CSV-bestand, liefst van minstens een jaar.${help}</p>
  <label class="spa-drop" data-drop>
    ${ICON_UPLOAD}
    <span><strong>Kies je CSV-bestand</strong> of sleep het hierheen</span>
    <span class="spa-drop-sub" data-file-name>Bestand van Mijn Fluvius (.csv)</span>
    <input type="file" accept=".csv,text/csv" data-file aria-describedby="${id('csvmsg')}">
  </label>
  <p class="spa-msg" id="${id('csvmsg')}" data-csv-msg role="status" hidden></p>
  <div class="spa-nav"><span></span><button type="button" class="spa-btn" data-next="2" disabled>Volgende</button></div>
</section>

<section class="spa-step" data-step="2" aria-labelledby="${id('t2')}" hidden>
  <${h} class="spa-title" id="${id('t2')}" tabindex="-1">Waar mogen we je resultaat naartoe sturen?</${h}>
  <div class="spa-field">
    <label for="${id('name')}">Naam</label>
    <input type="text" id="${id('name')}" data-name autocomplete="name" maxlength="120" required aria-describedby="${id('name-err')}">
    <p class="spa-error" id="${id('name-err')}" hidden>Vul je naam in.</p>
  </div>
  <div class="spa-field">
    <label for="${id('email')}">E-mail</label>
    <input type="email" id="${id('email')}" data-email autocomplete="email" maxlength="254" required aria-describedby="${id('email-err')}">
    <p class="spa-error" id="${id('email-err')}" hidden>Vul een geldig e-mailadres in.</p>
  </div>
  <p class="spa-help">We sturen je resultaat naar dit adres en gebruiken je gegevens om je analyse op te volgen.${privacy}</p>
  <div class="spa-nav">
    <button type="button" class="spa-btn spa-btn-ghost" data-back="1">Terug</button>
    <button type="button" class="spa-btn" data-next="3">Volgende</button>
  </div>
</section>

<section class="spa-step" data-step="3" aria-labelledby="${id('t3')}" hidden>
  <${h} class="spa-title" id="${id('t3')}" tabindex="-1">Maak je resultaat nauwkeuriger</${h}>
  <p class="spa-text">Deze gegevens zijn optioneel. Laat je iets leeg, dan rekenen we met een gangbare standaardwaarde.</p>
  <fieldset class="spa-field">
    <legend class="spa-legend">Is je woning 10 jaar of ouder?</legend>
    <p class="spa-help">Dat bepaalt mee het btw-tarief: 6% of 21%. Niet ingevuld: ${LEAD_DEFAULTS.btw}%.</p>
    <div class="spa-choices">
      <label class="spa-choice"><input type="radio" name="${id('age')}" value="true">Ja, 10 jaar of ouder</label>
      <label class="spa-choice"><input type="radio" name="${id('age')}" value="false">Nee, jonger dan 10 jaar</label>
    </div>
  </fieldset>
  <div class="spa-row">
    <div class="spa-field">
      <label for="${id('pv')}">Vermogen omvormer <span class="spa-optional">(kW)</span></label>
      <input type="text" inputmode="decimal" id="${id('pv')}" data-pv placeholder="bv. ${nl(LEAD_DEFAULTS.pvInverterKw)}" aria-describedby="${id('pv-help')} ${id('pv-err')}">
      <p class="spa-help" id="${id('pv-help')}">Op het typeplaatje van je omvormer, als "Max. AC Power". Niet ingevuld: ${nl(LEAD_DEFAULTS.pvInverterKw)} kW.</p>
      <p class="spa-error" id="${id('pv-err')}" hidden>Vul een vermogen tussen 0,1 en 100 kW in.</p>
    </div>
    <div class="spa-field">
      <label for="${id('price')}">Energieprijs <span class="spa-optional">(euro per kWh)</span></label>
      <input type="text" inputmode="decimal" id="${id('price')}" data-price placeholder="bv. ${nl(LEAD_DEFAULTS.pricePerKwh)}" aria-describedby="${id('price-help')} ${id('price-err')}">
      <p class="spa-help" id="${id('price-help')}">Je totale prijs per kWh, alles inbegrepen, zoals op je energiefactuur. Niet ingevuld: ${nl(LEAD_DEFAULTS.pricePerKwh)} euro.</p>
      <p class="spa-error" id="${id('price-err')}" hidden>Vul een prijs tussen 0,01 en 2 euro in.</p>
    </div>
  </div>
  <p class="spa-msg spa-msg-error" data-submit-msg role="alert" hidden></p>
  <div class="spa-nav">
    <button type="button" class="spa-btn spa-btn-ghost" data-back="2">Terug</button>
    <button type="button" class="spa-btn" data-submit>Bereken mijn resultaat</button>
  </div>
</section>

<section class="spa-step spa-done" data-step="4" aria-labelledby="${id('t4')}" hidden>
  ${ICON_MAIL}
  <${h} class="spa-title" id="${id('t4')}" tabindex="-1">Je resultaat is onderweg</${h}>
  <p class="spa-text">We hebben je persoonlijke analyse verstuurd naar <strong data-confirm-email></strong>. Kijk ook even in je spammap.</p>
  <p class="spa-text">Het resultaat is een eerste inschatting. We bekijken het graag samen met je, met je wensen en plannen erbij.</p>
</section>`;
}

function parseDecimal(value) {
  const v = String(value || '').trim().replace(',', '.');
  if (!v) return { empty: true };
  const n = Number(v);
  return Number.isFinite(n) ? { value: n } : { invalid: true };
}

function mount(root, index) {
  if (root.dataset.spaReady) return;
  root.dataset.spaReady = '1';
  const cfg = {
    helpUrl: root.dataset.helpUrl || '',
    privacyUrl: root.dataset.privacyUrl || '',
    email: root.dataset.email || 'info@smartpeak.be',
    source: root.dataset.source || (location.hostname + location.pathname),
    headingLevel: Math.min(6, Math.max(2, Number(root.dataset.headingLevel) || 3)),
    baseUrl: root.dataset.firestore || FIRESTORE_URL
  };
  const uid = `spa${index}`;
  root.classList.add('spa');
  root.innerHTML = template(cfg, uid);

  const $ = (sel) => root.querySelector(sel);
  const state = { csvText: null, configs: null };

  function goTo(step) {
    root.querySelectorAll('[data-step]').forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
    root.querySelectorAll('[data-dot]').forEach(el => {
      const n = Number(el.dataset.dot);
      el.classList.toggle('is-active', n === step);
      el.classList.toggle('is-done', n < step);
      if (n === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    $(`[data-step="${step}"] .spa-title`).focus({ preventScroll: true });
    const top = root.getBoundingClientRect().top;
    if (top < 0) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Start loading the product list early; retried on submit if it failed.
  function prefetchConfigs() {
    if (!state.configs) {
      state.configs = loadProductConfigs({ baseUrl: cfg.baseUrl });
      state.configs.catch(() => { state.configs = null; });
    }
    return state.configs;
  }

  // Step 1: the CSV file
  const fileInput = $('[data-file]');
  const drop = $('[data-drop]');
  const csvMsg = $('[data-csv-msg]');
  const next2 = $('[data-next="2"]');

  function showCsv(kind, text) {
    csvMsg.className = `spa-msg spa-msg-${kind}`;
    csvMsg.textContent = text;
    csvMsg.hidden = false;
  }

  async function handleFile(file) {
    if (!file) return;
    $('[data-file-name]').textContent = file.name;
    state.csvText = null;
    next2.disabled = true;
    if (!/\.csv$/i.test(file.name)) {
      showCsv('error', 'Kies een CSV-bestand (.csv), zoals Mijn Fluvius het aanbiedt.');
      return;
    }
    const text = await file.text();
    const read = readConsumptionCsv(text);
    if (!read.ok) {
      showCsv('error', read.error);
      return;
    }
    state.csvText = text;
    next2.disabled = false;
    if (read.days < 365) {
      showCsv('warn', `Bestand geladen: ${read.days} dagen verbruik. Dat is minder dan een jaar, dus we schatten het resultaat op basis van die periode.`);
    } else {
      showCsv('ok', `Bestand geladen: ${read.days} dagen verbruik gevonden.`);
    }
    prefetchConfigs();
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    handleFile(e.dataTransfer.files[0]);
  });

  // Navigation
  root.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => goTo(Number(btn.dataset.back))));
  next2.addEventListener('click', () => { if (state.csvText) goTo(2); });

  function setError(input, errorEl, invalid) {
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    errorEl.hidden = !invalid;
    return !invalid;
  }

  const nameInput = $('[data-name]');
  const emailInput = $('[data-email]');
  function validateContact() {
    const okName = setError(nameInput, $(`#${uid}-name-err`), !nameInput.value.trim());
    const email = emailInput.value.trim();
    const okEmail = setError(emailInput, $(`#${uid}-email-err`), !(email && emailInput.validity.valid && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)));
    if (!okName) nameInput.focus(); else if (!okEmail) emailInput.focus();
    return okName && okEmail;
  }
  $('[data-next="3"]').addEventListener('click', () => { if (validateContact()) goTo(3); });

  // Step 3: optional fields and submit
  const pvInput = $('[data-pv]');
  const priceInput = $('[data-price]');
  function readOptional(input, errorEl, min, max) {
    const p = parseDecimal(input.value);
    if (p.empty) { setError(input, errorEl, false); return { ok: true, value: 0 }; }
    const ok = !p.invalid && p.value >= min && p.value <= max;
    setError(input, errorEl, !ok);
    return { ok, value: ok ? p.value : 0 };
  }

  const submitBtn = $('[data-submit]');
  const submitMsg = $('[data-submit-msg]');
  submitBtn.addEventListener('click', async () => {
    const pv = readOptional(pvInput, $(`#${uid}-pv-err`), 0.1, 100);
    const price = readOptional(priceInput, $(`#${uid}-price-err`), 0.01, 2);
    if (!pv.ok) { pvInput.focus(); return; }
    if (!price.ok) { priceInput.focus(); return; }
    const age = root.querySelector(`input[name="${uid}-age"]:checked`);

    submitMsg.hidden = true;
    root.querySelectorAll('.spa-step[data-step="3"] button').forEach(b => { b.disabled = true; });
    submitBtn.innerHTML = '<span class="spa-spinner" aria-hidden="true"></span>Even rekenen…';
    try {
      const configs = await prefetchConfigs();
      await submitLeadAnalysis({
        csvText: state.csvText,
        name: nameInput.value,
        email: emailInput.value,
        pvInverterKw: pv.value,
        pricePerKwh: price.value,
        houseAgeOver10Years: age ? age.value === 'true' : null,
        source: cfg.source
      }, { resultPageUrl: RESULT_PAGE_URL, configs, baseUrl: cfg.baseUrl });
      $('[data-confirm-email]').textContent = emailInput.value.trim();
      goTo(4);
    } catch (error) {
      console.error('SmartPeak analyse:', error);
      submitMsg.innerHTML = `Er ging iets mis bij het versturen. Probeer het opnieuw, of mail je CSV-bestand naar <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.`;
      submitMsg.hidden = false;
      root.querySelectorAll('.spa-step[data-step="3"] button').forEach(b => { b.disabled = false; });
      submitBtn.textContent = 'Bereken mijn resultaat';
    }
  });
}

injectCss();
document.querySelectorAll('#smartpeak-analyse, [data-smartpeak-analyse]').forEach(mount);
