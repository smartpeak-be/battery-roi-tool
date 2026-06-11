import { escapeHtml } from './shared-helpers.js';

const BRAND = {
  primary: '#2c7be5',
  primaryDark: '#1a5fba',
  success: '#00b478',
  warning: '#f6a623',
  bg: '#f0f4fb',
  border: '#dce3f0',
  text: '#1e2a3a',
  muted: '#6b7a99',
};

function text(value, fallback = '') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function dateValue(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return String(value);
}

function formatDate(value, fallback = 'Nog niet ingevuld') {
  const raw = dateValue(value);
  if (!raw) return fallback;
  const iso = raw.slice(0, 10);
  const [year, month, day] = iso.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return raw;
}

function formatKwh(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Nog niet ingevuld';
  return `${Math.round(n).toLocaleString('nl-BE')} kWh`;
}

function formatKw(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Nog niet ingevuld';
  return `${n.toLocaleString('nl-BE', { maximumFractionDigits: 2 })} kW`;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Nog niet ingevuld';
  return `€ ${n.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function projectLabel(project) {
  return text(project?.customerName, text(project?.customer?.name, text(project?.projectName, '(zonder naam)')));
}

function firstConfig(project) {
  return project?.lastCalcRun?.results?.configResults?.[0]?.cfg || null;
}

function firstOfferte(project) {
  const offertes = project?.offertes || {};
  return Object.values(offertes)[0] || null;
}

function fileTitle(doc) {
  return text(doc?.title, text(doc?.name, 'Document'));
}

function classifyDocument(doc) {
  const hay = `${doc?.title || ''} ${doc?.name || ''} ${doc?.description || ''}`.toLowerCase();
  if (/factuur|invoice|voorschot|saldo/.test(hay)) return 'facturen';
  if (/handleiding|manual|gebruik/.test(hay)) return 'handleidingen';
  if (/datasheet|fiche|technisch|technical|schema|keuring|certificate|certificaat/.test(hay)) return 'technischeFiches';
  return 'overige';
}

function normalizePhoto(photo) {
  return {
    id: photo.id || '',
    tag: photo.tag === 'serial' ? 'serial' : 'situatie',
    title: text(photo.title, text(photo.name, 'Foto')),
    url: photo.annotatedThumbUrl || photo.thumbUrl || photo.downloadUrl || photo.url || '',
    fullUrl: photo.downloadUrl || photo.annotatedThumbUrl || photo.thumbUrl || photo.url || '',
  };
}

function normalizeDocument(doc) {
  return {
    id: doc.id || '',
    title: fileTitle(doc),
    name: text(doc.name),
    description: text(doc.description),
    contentType: text(doc.contentType),
    downloadUrl: doc.downloadUrl || '',
    category: classifyDocument(doc),
  };
}

export function buildClosingDossierModel(project, options = {}) {
  const cfg = firstConfig(project);
  const comments = (options.comments || []).map(c => ({
    date: formatDate(c.createdAt || c.occurredAt || c.date, ''),
    text: text(c.text || c.title || c.notes),
  })).filter(c => c.text);
  const photos = (options.photos || []).map(normalizePhoto);
  const documents = (options.documents || []).map(normalizeDocument);
  const docsByCategory = {
    facturen: documents.filter(d => d.category === 'facturen'),
    technischeFiches: documents.filter(d => d.category === 'technischeFiches'),
    handleidingen: documents.filter(d => d.category === 'handleidingen'),
    overige: documents.filter(d => d.category === 'overige'),
  };

  return {
    projectId: project?.id || '',
    generatedAt: options.generatedAt || new Date().toISOString(),
    title: 'Afsluitdossier installatie',
    customer: {
      name: projectLabel(project),
      address: text(project?.customer?.address),
      email: text(project?.customer?.email),
      phone: text(project?.customer?.phone),
    },
    status: text(project?.status, 'Onbekend'),
    planning: {
      visitDoneDate: formatDate(project?.planning?.visitDoneDate),
      installationDoneDate: formatDate(project?.planning?.installationDoneDate),
      inspectionPlannedDate: formatDate(project?.planning?.inspectionPlannedDate),
      inspectionDoneDate: formatDate(project?.planning?.inspectionDoneDate),
    },
    meter: {
      eanCode: text(project?.csvUpload?.eanCode, 'Nog niet ingevuld'),
      meterNumber: text(project?.csvUpload?.meterNr, ''),
      meterType: text(project?.csvUpload?.meterType, 'Nog niet ingevuld'),
    },
    solution: {
      description: text(cfg?.omschrijving, 'Nog niet ingevuld'),
      batteryCapacity: Number.isFinite(Number(cfg?.batCap)) ? `${Number(cfg.batCap).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} kWh` : 'Nog niet ingevuld',
      batteryInverter: formatKw(cfg?.batInv),
      pvInverter: formatKw(project?.lastCalcRun?.inputs?.pvInv),
      offerte: text(firstOfferte(project)?.filename, 'Nog niet gekoppeld'),
    },
    energyContext: {
      period: [project?.lastCalcRun?.results?.windowStart, project?.lastCalcRun?.results?.lastDate].filter(Boolean).join(' → ') || 'Nog niet ingevuld',
      totalAfname: formatKwh(project?.lastCalcRun?.results?.totalAfname),
      totalInjectie: formatKwh(project?.lastCalcRun?.results?.totalInjectie),
      effectivePrice: `${formatMoney(project?.lastCalcRun?.results?.effectivePrice)}/kWh`,
    },
    serialNumbers: (project?.serialNumbers || []).map(s => ({
      category: text(s.category, 'Onbekend'),
      value: text(s.value),
      source: text(s.source),
    })).filter(s => s.value),
    photos: {
      situation: photos.filter(p => p.tag !== 'serial'),
      serial: photos.filter(p => p.tag === 'serial'),
    },
    documents: docsByCategory,
    timeline: comments,
  };
}

function fact(label, value) {
  return `<div class="spcd-fact"><div class="spcd-label">${escapeHtml(label)}</div><div class="spcd-value">${escapeHtml(value || 'Nog niet ingevuld')}</div></div>`;
}

function section(title, body, extraClass = '') {
  return `<section class="spcd-card ${extraClass}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function documentList(items, placeholder) {
  if (!items.length) return `<p class="spcd-muted mb-0">${escapeHtml(placeholder)}</p>`;
  return `<ul class="spcd-doc-list">${items.map(d => `<li>${d.downloadUrl ? `<a href="${escapeHtml(d.downloadUrl)}" target="_blank" rel="noopener">${escapeHtml(d.title)}</a>` : escapeHtml(d.title)}${d.description ? `<span>${escapeHtml(d.description)}</span>` : ''}</li>`).join('')}</ul>`;
}

function photoGrid(items, label) {
  if (!items.length) return '<p class="spcd-muted">Nog geen foto’s beschikbaar in deze categorie.</p>';
  return `<div class="spcd-photo-grid">${items.map((p, i) => `
    <figure>
      ${p.url ? `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(`${label} ${i + 1}`)}">` : '<div class="spcd-photo-placeholder">Foto niet beschikbaar</div>'}
      <figcaption><strong>${escapeHtml(label)} ${i + 1}</strong><span>${escapeHtml(p.title)}</span></figcaption>
    </figure>
  `).join('')}</div>`;
}

function serialRows(serials) {
  if (!serials.length) return '<tr><td colspan="3">Nog geen serienummers geregistreerd.</td></tr>';
  return serials.map(s => `<tr><td>${escapeHtml(s.category)}</td><td><code>${escapeHtml(s.value)}</code></td><td>${escapeHtml(s.source)}</td></tr>`).join('');
}

function timeline(items) {
  if (!items.length) return '<p class="spcd-muted">Nog geen projectopmerkingen beschikbaar.</p>';
  return `<ul class="spcd-timeline">${items.map(i => `<li><strong>${escapeHtml(i.date || '')}</strong><span>${escapeHtml(i.text)}</span></li>`).join('')}</ul>`;
}

export function closingDossierStyles() {
  return `
    <style>
      :root{--spcd-primary:${BRAND.primary};--spcd-primary-dark:${BRAND.primaryDark};--spcd-success:${BRAND.success};--spcd-warning:${BRAND.warning};--spcd-bg:${BRAND.bg};--spcd-border:${BRAND.border};--spcd-text:${BRAND.text};--spcd-muted:${BRAND.muted};}
      *{box-sizing:border-box} body.spcd-body{margin:0;font-family:"Segoe UI",Inter,Arial,sans-serif;color:var(--spcd-text);background:#fff;font-size:14px;line-height:1.45}.spcd-printbar{position:sticky;top:0;z-index:10;display:flex;gap:.5rem;justify-content:flex-end;padding:.75rem 1rem;background:rgba(255,255,255,.94);border-bottom:1px solid var(--spcd-border);backdrop-filter:blur(8px)}.spcd-printbar button{border:0;border-radius:999px;background:linear-gradient(135deg,var(--spcd-primary),var(--spcd-success));color:white;font-weight:700;padding:.65rem 1rem;cursor:pointer}.spcd-cover{min-height:100vh;padding:72px 56px;background:radial-gradient(circle at 84% 84%,rgba(44,123,229,.12),transparent 34%),radial-gradient(circle at 88% 8%,rgba(0,180,120,.16),transparent 30%),linear-gradient(135deg,#f8fbff,#edf4ff 55%,#eafff7);position:relative;overflow:hidden}.spcd-brand{display:flex;align-items:center;gap:13px;font-weight:850;color:var(--spcd-primary-dark);font-size:32px;letter-spacing:-.05em}.spcd-brand-mark{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--spcd-primary),var(--spcd-success));display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 12px 26px rgba(44,123,229,.24)}.spcd-subtitle{font-size:13px;color:var(--spcd-muted);font-weight:700;letter-spacing:0}.spcd-cover h1{margin:112px 0 18px;max-width:760px;font-size:52px;line-height:1.05;letter-spacing:-.07em;color:#10233f}.spcd-lead{max-width:660px;font-size:18px;color:#51627d}.spcd-cover-card{margin-top:70px;max-width:640px;background:rgba(255,255,255,.88);border:1px solid rgba(220,227,240,.95);border-radius:22px;padding:38px;box-shadow:0 24px 58px rgba(30,42,58,.10)}.spcd-meta-grid,.spcd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 24px}.spcd-label{text-transform:uppercase;color:#7b8baa;font-size:11px;letter-spacing:.08em;font-weight:800}.spcd-value{margin-top:5px;font-weight:750;color:#17243a}.spcd-pill{display:inline-flex;padding:5px 10px;border-radius:999px;background:#eaf3ff;color:var(--spcd-primary-dark);font-size:12px;font-weight:800}.spcd-page{padding:0 0 32px}.spcd-card{break-inside:avoid;margin:0 0 28px;padding:30px 32px;border:1px solid var(--spcd-border);border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(30,42,58,.045)}.spcd-card h2{margin:0 0 20px;font-size:26px;letter-spacing:-.045em;color:#17365f;display:flex;align-items:center;gap:10px}.spcd-card h2:before{content:"";width:7px;height:25px;border-radius:999px;background:linear-gradient(var(--spcd-primary),var(--spcd-success))}.spcd-fact{background:#f7f9fd;border:1px solid var(--spcd-border);border-radius:13px;padding:16px;min-height:74px}.spcd-callout{border-left:4px solid var(--spcd-success);background:#effbf6;padding:15px 18px;border-radius:12px;margin-top:16px}.spcd-callout-warning{border-left-color:var(--spcd-warning);background:#fff8eb}.spcd-muted{color:var(--spcd-muted)}.spcd-timeline{list-style:none;margin:0;padding:0}.spcd-timeline li{display:grid;grid-template-columns:120px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid var(--spcd-border)}.spcd-timeline strong{color:var(--spcd-primary-dark)}table.spcd-table{width:100%;border-collapse:collapse}table.spcd-table th,table.spcd-table td{padding:12px;border-bottom:1px solid var(--spcd-border);text-align:left;vertical-align:top}table.spcd-table th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--spcd-muted)}code{background:#edf4ff;color:#10233f;border-radius:6px;padding:3px 7px}.spcd-doc-list{margin:0;padding-left:18px}.spcd-doc-list li{margin-bottom:8px}.spcd-doc-list span{display:block;color:var(--spcd-muted);font-size:12px}.spcd-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.spcd-photo-grid figure{margin:0;border:1px solid var(--spcd-border);border-radius:16px;overflow:hidden;background:#fff;break-inside:avoid}.spcd-photo-grid img,.spcd-photo-placeholder{width:100%;height:280px;object-fit:cover;display:flex;align-items:center;justify-content:center;background:#eef3fb;color:var(--spcd-muted)}.spcd-photo-grid figcaption{padding:12px 14px}.spcd-photo-grid figcaption span{display:block;color:var(--spcd-muted);font-size:12px;margin-top:2px;word-break:break-word}.spcd-break{break-before:page}@media print{.spcd-printbar{display:none}.spcd-cover{min-height:100vh}.spcd-card{box-shadow:none;margin-bottom:18px}.spcd-photo-grid img,.spcd-photo-placeholder{height:220px}a{color:inherit;text-decoration:none}}@media(max-width:760px){.spcd-cover{padding:42px 24px}.spcd-cover h1{font-size:40px;margin-top:72px}.spcd-meta-grid,.spcd-grid,.spcd-photo-grid{grid-template-columns:1fr}.spcd-timeline li{grid-template-columns:1fr}.spcd-card{padding:24px 20px}}
    </style>
  `;
}

export function renderClosingDossierHtml(model) {
  const generatedDate = formatDate(model.generatedAt);
  const docCards = `
    <div class="spcd-grid">
      ${fact('Offerte', model.solution.offerte)}
      <div class="spcd-fact"><div class="spcd-label">Facturen</div>${documentList(model.documents.facturen, 'Plaats voorzien voor voorschot- en saldofactuur.')}</div>
      <div class="spcd-fact"><div class="spcd-label">Technische fiches</div>${documentList(model.documents.technischeFiches, 'Plaats voorzien per geplaatst product.')}</div>
      <div class="spcd-fact"><div class="spcd-label">Handleidingen</div>${documentList(model.documents.handleidingen, 'Plaats voorzien per geplaatst product.')}</div>
    </div>`;

  return `<!doctype html><html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(model.title)} - ${escapeHtml(model.customer.name)}</title>${closingDossierStyles()}</head><body class="spcd-body">
    <div class="spcd-printbar"><button type="button" data-closing-dossier-print onclick="window.print()">PDF maken / afdrukken</button></div>
    <section class="spcd-cover">
      <div class="spcd-brand"><div class="spcd-brand-mark">⚡</div><div>SmartPeak<div class="spcd-subtitle">Slim omgaan met jouw energie</div></div></div>
      <h1>${escapeHtml(model.title)}</h1>
      <p class="spcd-lead">Een gebundeld overzicht van de aanvraag, uitgevoerde installatie, beschikbare foto’s, serienummers, documenten en praktische opvolging.</p>
      <div class="spcd-cover-card"><div class="spcd-meta-grid">
        ${fact('Klant', model.customer.name)}${fact('Projectstatus', model.status)}${fact('Adres', model.customer.address)}${fact('Keuring gepland', model.planning.inspectionPlannedDate)}${fact('Contact', [model.customer.email, model.customer.phone].filter(Boolean).join(' · '))}${fact('Dossierdatum', generatedDate)}
      </div></div>
    </section>
    <main class="spcd-page">
      ${section('Inhoud en bedoeling', `<ul><li>Projectoverzicht vanuit klantperspectief</li><li>Originele aanvraag en bekeken situatie</li><li>Geplaatste of voorziene oplossing</li><li>Foto-overzicht: situatie en serienummers</li><li>Technische documentatie, handleidingen, facturen en keuring</li></ul><div class="spcd-callout spcd-callout-warning"><strong>Bewust niet opgenomen:</strong> De berekening zelf wordt niet opgenomen in dit afsluitdossier, zodat het dossier focust op de uitgevoerde werken, documenten en praktische gegevens.</div>`)}
      ${section('Projectoverzicht', `<div class="spcd-grid">${fact('Klant', model.customer.name)}${fact('Adres', model.customer.address)}${fact('E-mail', model.customer.email)}${fact('Telefoon', model.customer.phone)}${fact('EAN-code', model.meter.eanCode)}${fact('Meter', `${model.meter.meterType}${model.meter.meterNumber ? ` · ${model.meter.meterNumber}` : ''}`)}</div>`)}
      ${section('Originele aanvraag en context', `<p>Dit onderdeel bundelt de oorspronkelijke klantvraag, plaatsbezoeknotities, foto’s van de bestaande situatie en de gemaakte keuze. Waar nog geen gestructureerde tekst beschikbaar is, blijft dit zichtbaar als aan te vullen onderdeel.</p><div class="spcd-callout"><strong>Toekomst:</strong> automatisch tonen welke opties bekeken werden, waarom de gekozen oplossing geplaatst werd, en welke randvoorwaarden of afspraken belangrijk waren.</div>`)}
      ${section('Geplaatste / voorziene oplossing', `<div class="spcd-grid">${fact('Configuratie', model.solution.description)}${fact('Batterijcapaciteit', model.solution.batteryCapacity)}${fact('Batterij-omvormer', model.solution.batteryInverter)}${fact('PV-omvormer', model.solution.pvInverter)}${fact('Offerte', model.solution.offerte)}${fact('Keuring', model.planning.inspectionPlannedDate !== 'Nog niet ingevuld' || model.planning.inspectionDoneDate !== 'Nog niet ingevuld' ? 'Voorzien' : 'Nog te bevestigen')}</div>`)}
      ${section('Verbruik / injectie samenvatting', `<p class="spcd-muted">Compacte context, zonder ROI-detail of terugverdientijd.</p><div class="spcd-grid">${fact('CSV-periode', model.energyContext.period)}${fact('Afname jaarvenster', model.energyContext.totalAfname)}${fact('Injectie jaarvenster', model.energyContext.totalInjectie)}${fact('Energieprijs gebruikt', model.energyContext.effectivePrice)}</div><div class="spcd-callout spcd-callout-warning">De berekening zelf wordt niet opgenomen in dit afsluitdossier.</div>`)}
      ${section('Planning en opvolging', `<div class="spcd-grid">${fact('Plaatsbezoek uitgevoerd', model.planning.visitDoneDate)}${fact('Installatie afgerond', model.planning.installationDoneDate)}${fact('Keuring gepland', model.planning.inspectionPlannedDate)}${fact('Keuring afgerond', model.planning.inspectionDoneDate)}</div><h3>Tijdlijn uit projectopmerkingen</h3>${timeline(model.timeline)}`)}
      ${section('Serienummers', `<table class="spcd-table"><thead><tr><th>Categorie</th><th>Serienummer</th><th>Bron</th></tr></thead><tbody>${serialRows(model.serialNumbers)}</tbody></table>`)}
      ${section('Documenten en bijlagen', docCards)}
      ${section('Foto’s huidige / bekeken situatie', photoGrid(model.photos.situation, 'Situatiefoto'), 'spcd-break')}
      ${section('Foto’s serienummers', photoGrid(model.photos.serial, 'Serienummerfoto'), 'spcd-break')}
    </main>
  </body></html>`;
}

export function openClosingDossierPrintWindow(model, targetWindow = null) {
  const html = renderClosingDossierHtml(model);
  const browserWindow = typeof globalThis.window !== 'undefined' ? globalThis.window : null;
  const win = targetWindow || (browserWindow ? browserWindow.open('', 'smartpeakClosingDossier') : null);
  if (!win) return { ok: false, html };
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (typeof win.focus === 'function') win.focus();
  return { ok: true, html };
}

if (typeof globalThis.window !== 'undefined') {
  globalThis.window.SmartPeakClosingDossier = {
    buildClosingDossierModel,
    renderClosingDossierHtml,
    openClosingDossierPrintWindow,
  };
}
