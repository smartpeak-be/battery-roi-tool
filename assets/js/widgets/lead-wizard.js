// SmartPeak verbruiksanalyse as an embeddable widget for smartpeak.be (no Bootstrap, no Firebase
// SDK, no keys). Open by design: the visitor uploads the Fluvius CSV, optionally gives a price per
// kWh, and sees the result right away, calculated in the browser. Nothing is stored or sent until
// the visitor asks to be contacted; then the lead (hot), the result mail and the notification to
// Kevin and Ruben are written exactly like lead.html and lead-result.html do.
//
// Embed:
//   <div id="smartpeak-analyse"
//        data-help-url="https://smartpeak.be/hulp/p1-poort-activeren/#verbruik-downloaden"
//        data-privacy-url="https://smartpeak.be/privacyverklaring/"
//        data-email="info@smartpeak.be"></div>
//   <script type="module" src="https://smartpeak-be.github.io/battery-roi-tool/assets/js/widgets/lead-wizard.js"></script>
//
// Optional data attributes on the mount element:
//   data-phone, data-phone-href  phone number shown next to the contact form
//   data-source         where the lead came from (default: the page path), noted on the lead
//   data-heading-level  heading level for the step titles (default 3)
//   data-firestore      Firestore REST base URL (tests only, e.g. the emulator)
// The host page hears about a contact request through the "sp:lead" event on document.
// Styling: the widget injects a small default stylesheet driven by CSS custom properties
// (--spa-accent, --spa-ink, --spa-line, ...), so the host page can restyle it.

import { readConsumptionCsv, loadProductConfigs, submitLeadAnalysis, FIRESTORE_URL } from '../lead-submit.js';
import { LEAD_DEFAULTS, buildPublicIndication } from '../lead-calc.js';
import { renderAnalysisResult, yearlyTotals } from './analysis-result.js';

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
.spa .spa-subtitle{margin:.5rem 0 0;font-size:1.08rem}
.spa .spa-metrics{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem}
.spa .spa-metric{display:grid;align-content:start;gap:.3rem;padding:1rem 1.1rem;border-radius:var(--spa-radius);background:var(--spa-paper);margin:0}
.spa .spa-metric-label{font-size:.9rem;font-weight:600;color:var(--spa-soft)}
.spa .spa-metric-value{font-size:1.45rem;font-weight:700;line-height:1.2;color:var(--spa-accent-deep)}
.spa .spa-metric-detail{font-size:.9rem;color:var(--spa-soft)}
.spa .spa-notes{margin:0;padding-left:1.2rem;display:grid;gap:.45rem;color:var(--spa-soft)}
.spa .spa-notes strong{color:var(--spa-ink)}
.spa .spa-contact{display:grid;gap:1rem;margin-top:.5rem;padding:clamp(1rem,3vw,1.5rem);border:1.5px solid var(--spa-accent);border-radius:var(--spa-radius-l);background:#f4fbf7}
.spa .spa-consent{display:flex;gap:.6rem;align-items:flex-start;font-weight:400}
.spa .spa-consent input{width:1.15rem;height:1.15rem;margin:.2rem 0 0;flex:none;accent-color:var(--spa-accent-deep)}
.spa .spa-field input[type=tel]{width:100%;font:inherit;color:var(--spa-ink);background:#fff;border:1.5px solid #c9d5d1;border-radius:8px;padding:.7rem .8rem;min-height:3rem}
.spa .spa-link{background:none;border:0;padding:0;font:inherit;color:var(--spa-ink);text-decoration:underline;cursor:pointer}
.spa .spa-link:focus-visible{outline:3px solid var(--spa-focus);outline-offset:2px}
@keyframes spa-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spa .spa-spinner{animation-duration:2.4s}}
@media (max-width:720px){.spa .spa-metrics{grid-template-columns:1fr}}
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
  const privacy = cfg.privacyUrl ? ` (<a href="${esc(cfg.privacyUrl)}">privacyverklaring</a>)` : '';
  const phone = cfg.phone ? `<p class="spa-help">Liever bellen? <a href="${esc(cfg.phoneHref || `tel:${cfg.phone}`)}">${esc(cfg.phone)}</a></p>` : '';
  return `
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
  <div class="spa-field">
    <label for="${id('price')}">Jouw prijs per kWh <span class="spa-optional">(optioneel, in euro)</span></label>
    <input type="text" inputmode="decimal" id="${id('price')}" data-price placeholder="bv. ${nl(LEAD_DEFAULTS.pricePerKwh)}" aria-describedby="${id('price-help')} ${id('price-err')}">
    <p class="spa-help" id="${id('price-help')}">De totale prijs die je betaalt, alles inbegrepen: energie, netkosten, heffingen en btw. Je vindt hem op je jaarafrekening. Niet ingevuld: ${nl(LEAD_DEFAULTS.pricePerKwh)} euro.</p>
    <p class="spa-error" id="${id('price-err')}" hidden>Vul een prijs tussen 0,01 en 2 euro in, bijvoorbeeld ${nl(LEAD_DEFAULTS.pricePerKwh)}.</p>
  </div>
  <p class="spa-help">Je bestand wordt enkel in je browser verwerkt. We ontvangen niets, tenzij je daarna zelf vraagt om contact.</p>
  <div class="spa-nav"><span></span><button type="button" class="spa-btn" data-calc disabled>Bereken mijn resultaat</button></div>
</section>

<section class="spa-step" data-step="2" aria-labelledby="${id('t2')}" hidden>
  <${h} class="spa-title" id="${id('t2')}" tabindex="-1">Jouw resultaat</${h}>
  <div data-result></div>
  <form class="spa-contact" data-contact novalidate aria-labelledby="${id('t3')}">
    <${h} class="spa-subtitle" id="${id('t3')}">Bekijken we het samen?</${h}>
    <p class="spa-text">Laat je gegevens achter. We bekijken je resultaat en nemen contact met je op om de volgende stap te bespreken. Je krijgt dit resultaat dan ook per mail.</p>
    <div class="spa-field">
      <label for="${id('name')}">Naam</label>
      <input type="text" id="${id('name')}" data-name autocomplete="name" maxlength="120" required aria-describedby="${id('name-err')}">
      <p class="spa-error" id="${id('name-err')}" hidden>Vul je naam in.</p>
    </div>
    <div class="spa-row">
      <div class="spa-field">
        <label for="${id('email')}">E-mail</label>
        <input type="email" id="${id('email')}" data-email autocomplete="email" maxlength="254" required aria-describedby="${id('email-err')}">
        <p class="spa-error" id="${id('email-err')}" hidden>Vul een geldig e-mailadres in.</p>
      </div>
      <div class="spa-field">
        <label for="${id('phone')}">Telefoon <span class="spa-optional">(optioneel)</span></label>
        <input type="tel" id="${id('phone')}" data-phone autocomplete="tel" maxlength="30">
      </div>
    </div>
    <div class="spa-field">
      <label class="spa-consent"><input type="checkbox" data-consent required aria-describedby="${id('consent-err')}"><span>SmartPeak mag me contacteren over deze analyse en bewaart daarvoor mijn verbruiksgegevens${privacy}.</span></label>
      <p class="spa-error" id="${id('consent-err')}" hidden>Vink dit aan, anders kunnen we geen contact opnemen.</p>
    </div>
    <p class="spa-msg spa-msg-error" data-submit-msg role="alert" hidden></p>
    <div class="spa-nav">
      <button type="button" class="spa-link" data-restart>Ander bestand of andere prijs</button>
      <button type="submit" class="spa-btn" data-submit>Neem contact met me op</button>
    </div>
    ${phone}
  </form>
</section>

<section class="spa-step spa-done" data-step="3" aria-labelledby="${id('t4')}" hidden>
  ${ICON_MAIL}
  <${h} class="spa-title" id="${id('t4')}" tabindex="-1">Bedankt, we nemen contact op</${h}>
  <p class="spa-text">We bekijken je resultaat en nemen snel contact met je op. Je resultaat staat ook in je mailbox op <strong data-confirm-email></strong>. Kijk ook even in je spammap.</p>
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
    phone: root.dataset.phone || '',
    phoneHref: root.dataset.phoneHref || '',
    source: root.dataset.source || (location.hostname + location.pathname),
    headingLevel: Math.min(6, Math.max(2, Number(root.dataset.headingLevel) || 3)),
    baseUrl: root.dataset.firestore || FIRESTORE_URL
  };
  const uid = `spa${index}`;
  root.classList.add('spa');
  root.innerHTML = template(cfg, uid);

  const $ = (sel) => root.querySelector(sel);
  const state = { csvText: null, allDays: null, price: 0, configs: null };

  function goTo(step) {
    root.querySelectorAll('[data-step]').forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
    $(`[data-step="${step}"] .spa-title`).focus({ preventScroll: true });
    const top = root.getBoundingClientRect().top;
    if (top < 0) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The product list is only needed for the (internal) lead result; loaded once a result is shown.
  function prefetchConfigs() {
    if (!state.configs) {
      state.configs = loadProductConfigs({ baseUrl: cfg.baseUrl });
      state.configs.catch(() => { state.configs = null; });
    }
    return state.configs;
  }

  function setError(input, errorEl, invalid) {
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    errorEl.hidden = !invalid;
    return !invalid;
  }

  // Step 1: the CSV file and the price
  const fileInput = $('[data-file]');
  const drop = $('[data-drop]');
  const csvMsg = $('[data-csv-msg]');
  const calcBtn = $('[data-calc]');
  const priceInput = $('[data-price]');

  function showCsv(kind, text) {
    csvMsg.className = `spa-msg spa-msg-${kind}`;
    csvMsg.textContent = text;
    csvMsg.hidden = false;
  }

  async function handleFile(file) {
    if (!file) return;
    $('[data-file-name]').textContent = file.name;
    state.csvText = null;
    state.allDays = null;
    calcBtn.disabled = true;
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
    state.allDays = read.allDays;
    calcBtn.disabled = false;
    if (read.days < 365) {
      showCsv('warn', `Bestand geladen: ${read.days} dagen verbruik. Dat is minder dan een jaar, dus we rekenen het om naar een jaar.`);
    } else {
      showCsv('ok', `Bestand geladen: ${read.days} dagen verbruik gevonden.`);
    }
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    handleFile(e.dataTransfer.files[0]);
  });

  calcBtn.addEventListener('click', () => {
    if (!state.allDays) return;
    const p = parseDecimal(priceInput.value);
    const okPrice = p.empty || (!p.invalid && p.value >= 0.01 && p.value <= 2);
    if (!setError(priceInput, $(`#${uid}-price-err`), !okPrice)) { priceInput.focus(); return; }
    state.price = p.empty ? 0 : p.value;
    const price = state.price || LEAD_DEFAULTS.pricePerKwh;
    const indication = buildPublicIndication(state.allDays, price);
    $('[data-result]').innerHTML = renderAnalysisResult(indication, yearlyTotals(state.allDays), {
      priceGiven: !p.empty, headingLevel: cfg.headingLevel
    });
    goTo(2);
    prefetchConfigs();
    document.dispatchEvent(new CustomEvent('sp:analysis', { detail: { indication: Boolean(indication) } }));
  });

  $('[data-restart]').addEventListener('click', () => goTo(1));

  // Step 2: contact request (optional)
  const form = $('[data-contact]');
  const nameInput = $('[data-name]');
  const emailInput = $('[data-email]');
  const consentInput = $('[data-consent]');
  const submitBtn = $('[data-submit]');
  const submitMsg = $('[data-submit-msg]');

  function validateContact() {
    const okName = setError(nameInput, $(`#${uid}-name-err`), !nameInput.value.trim());
    const email = emailInput.value.trim();
    const okEmail = setError(emailInput, $(`#${uid}-email-err`), !(email && emailInput.validity.valid && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)));
    const okConsent = setError(consentInput, $(`#${uid}-consent-err`), !consentInput.checked);
    if (!okName) nameInput.focus(); else if (!okEmail) emailInput.focus(); else if (!okConsent) consentInput.focus();
    return okName && okEmail && okConsent;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateContact()) return;
    submitMsg.hidden = true;
    form.querySelectorAll('button').forEach(b => { b.disabled = true; });
    submitBtn.innerHTML = '<span class="spa-spinner" aria-hidden="true"></span>Even versturen…';
    try {
      const configs = await prefetchConfigs();
      await submitLeadAnalysis({
        csvText: state.csvText,
        name: nameInput.value,
        email: emailInput.value,
        phone: $('[data-phone]').value,
        pricePerKwh: state.price,
        houseAgeOver10Years: null,
        requestContact: true,
        source: cfg.source
      }, { resultPageUrl: RESULT_PAGE_URL, configs, baseUrl: cfg.baseUrl });
      $('[data-confirm-email]').textContent = emailInput.value.trim();
      goTo(3);
      document.dispatchEvent(new CustomEvent('sp:lead', { detail: { bron: 'verbruiksanalyse' } }));
    } catch (error) {
      console.error('SmartPeak analyse:', error);
      submitMsg.innerHTML = `Er ging iets mis bij het versturen. Probeer het opnieuw, of mail je CSV-bestand naar <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.`;
      submitMsg.hidden = false;
      form.querySelectorAll('button').forEach(b => { b.disabled = false; });
      submitBtn.textContent = 'Neem contact met me op';
    }
  });
}

injectCss();
document.querySelectorAll('#smartpeak-analyse, [data-smartpeak-analyse]').forEach(mount);
