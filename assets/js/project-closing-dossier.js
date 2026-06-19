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

const VOLTAGE_LABELS = {
  l1N: 'L1 - N', l2N: 'L2 - N', l3N: 'L3 - N',
  l1L2: 'L1 - L2', l1L3: 'L1 - L3', l2L3: 'L2 - L3',
  l1Pe: 'L1 - PE', l2Pe: 'L2 - PE', l3Pe: 'L3 - PE', nPe: 'N - PE',
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

function productLabel(product) {
  return [product?.brand, product?.model].filter(Boolean).join(' ').trim()
    || product?.description
    || product?.name
    || 'Product';
}

function classifyDocument(doc) {
  const hay = `${doc?.title || ''} ${doc?.name || ''} ${doc?.description || ''}`.toLowerCase();
  if (/factuur|invoice|voorschot|saldo/.test(hay)) return 'facturen';
  if (/handleiding|manual|gebruik/.test(hay)) return 'handleidingen';
  if (/datasheet|fiche|technisch|technical|schema|keuring|certificate|certificaat/.test(hay)) return 'technischeFiches';
  return 'overige';
}

function normalizePhoto(photo) {
  const full = photo.downloadUrl || photo.url || photo.annotatedUrl || photo.fullUrl || '';
  return {
    id: photo.id || '',
    tag: photo.tag === 'serial' ? 'serial' : 'situatie',
    title: text(photo.title, text(photo.name, 'Foto')),
    // Gebruik originele URL eerst; thumbnails maken het dossier zichtbaar korrelig.
    url: full || photo.annotatedThumbUrl || photo.thumbUrl || '',
    fullUrl: full || photo.annotatedThumbUrl || photo.thumbUrl || '',
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

function productSpecsText(product) {
  const specs = product?.specs || {};
  const parts = [];
  if (Number.isFinite(Number(specs.capacityKwh))) parts.push(`${Number(specs.capacityKwh).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} kWh`);
  if (Number.isFinite(Number(specs.powerKw))) parts.push(`${Number(specs.powerKw).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} kW`);
  if (Number.isFinite(Number(specs.weightKg))) parts.push(`${Number(specs.weightKg).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} kg`);
  return parts.join(' · ');
}

function buildPlacedItems(cfg, productsById = {}) {
  const items = Array.isArray(cfg?.items) ? cfg.items : [];
  const mapped = items.map(item => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const product = productsById[item.productId] || item.product || null;
    const label = product ? productLabel(product) : text(item.description || item.productId, 'Product');
    return {
      qty,
      label,
      specs: productSpecsText(product),
      datasheetUrl: product?.datasheetUrl || product?.specs?.datasheetUrl || item.datasheetUrl || '',
      manualUrl: product?.manualUrl || product?.specs?.manualUrl || item.manualUrl || '',
    };
  }).filter(item => item.label);
  if (mapped.length) return mapped;
  if (cfg?.omschrijving) {
    return [{ qty: 1, label: cfg.omschrijving, specs: '', datasheetUrl: '', manualUrl: '' }];
  }
  return [];
}

function buildTechnicalRows(project) {
  const t = project?.technical || {};
  const rows = [];
  if (t.earthResistanceMeasured === true) rows.push(['Aardweerstand gemeten', 'Ja']);
  else if (t.earthResistanceMeasured === false) rows.push(['Aardweerstand gemeten', 'Nee']);
  if (t.earthResistanceOhm != null && t.earthResistanceOhm !== '') rows.push(['Aardweerstand', `${t.earthResistanceOhm} Ω`]);
  if (t.earthResistanceMeasuredDate) rows.push(['Meetdatum aardweerstand', formatDate(t.earthResistanceMeasuredDate)]);
  Object.entries(t.voltageMeasurements || {}).forEach(([key, value]) => {
    if (value != null && value !== '') rows.push([`Spanning ${VOLTAGE_LABELS[key] || key}`, `${value} V`]);
  });
  const electrical = project?.electrical || {};
  if (electrical.connectionType) rows.push(['Aansluiting', electrical.connectionType]);
  if (electrical.fuseRatingA) rows.push(['Hoofdzekering', `${electrical.fuseRatingA} A`]);
  (project?.solar?.inverters || []).forEach((inv, idx) => {
    const label = [inv.brand, inv.model].filter(Boolean).join(' ').trim() || `Omvormer ${idx + 1}`;
    const power = inv.powerKw != null ? ` · ${formatKw(inv.powerKw)}` : '';
    const panels = inv.panelCount != null ? ` · ${inv.panelCount} panelen` : '';
    const circuitCount = inv.circuitCount != null ? ` · ${inv.circuitCount} kring(en)` : '';
    rows.push([`PV-omvormer ${idx + 1}`, `${label}${power}${panels}${circuitCount}`]);
    (inv.circuits || []).forEach((circuit, circuitIdx) => {
      const circuitBits = [];
      if (circuit.panelCount != null && circuit.panelCount !== '') circuitBits.push(`${circuit.panelCount} panelen`);
      if (circuit.voltage != null && circuit.voltage !== '') circuitBits.push(`${circuit.voltage} V`);
      const panelType = [circuit.panelBrand, circuit.panelModel].filter(Boolean).join(' ').trim();
      if (panelType) circuitBits.push(panelType);
      if (circuitBits.length) rows.push([`PV-omvormer ${idx + 1} · kring ${circuitIdx + 1}`, circuitBits.join(' · ')]);
    });
  });
  if (t.technicalNotes) rows.push(['Technische opmerkingen', t.technicalNotes]);
  return rows;
}

export function buildClosingDossierModel(project, options = {}) {
  const cfg = firstConfig(project);
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
    originalRequestSource: text(project?.situation || project?.description || project?.customerRequest || ''),
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
    placedItems: buildPlacedItems(cfg, options.productsById || {}),
    technicalRows: buildTechnicalRows(project),
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
    // Projectopmerkingen blijven interne keuken en gaan bewust niet mee.
    timeline: [],
  };
}

export function buildClosingDossierDraftTexts(model) {
  const original = model.originalRequestSource
    || 'Beschrijf hier kort de oorspronkelijke aanvraag en wat SmartPeak ter plaatse of op basis van de projectgegevens heeft bekeken.';
  return {
    projectSummary: `Voor ${model.customer.name} werd een thuisbatterij-oplossing uitgewerkt en opgevolgd door SmartPeak. Dit dossier bundelt de belangrijkste gegevens, documenten, foto’s en technische informatie rond het project.`,
    originalRequest: original,
    solutionSummary: `De gekozen configuratie is ${model.solution.description}. De voorziene batterijcapaciteit bedraagt ${model.solution.batteryCapacity}.`,
    technicalSummary: model.technicalRows.length
      ? 'Onderstaande technische gegevens en metingen werden geregistreerd tijdens de voorbereiding, plaatsing of opvolging van het project.'
      : 'Technische gegevens en metingen kunnen hier aangevuld worden wanneer ze beschikbaar zijn.',
  };
}

function paragraph(value) {
  return `<p class="spcd-copy">${escapeHtml(value || '')}</p>`;
}

function fact(label, value) {
  return `<div class="spcd-fact"><div class="spcd-label">${escapeHtml(label)}</div><div class="spcd-value">${escapeHtml(value || 'Nog niet ingevuld')}</div></div>`;
}

function section(title, body, extraClass = '') {
  return `<section class="spcd-card ${extraClass}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function tableRows(rows, empty = 'Nog niet ingevuld.') {
  if (!rows.length) return `<tr><td colspan="2">${escapeHtml(empty)}</td></tr>`;
  return rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
}

function documentList(items, placeholder) {
  if (!items.length) return `<p class="spcd-muted mb-0">${escapeHtml(placeholder)}</p>`;
  return `<ul class="spcd-doc-list">${items.map(d => `<li>${d.downloadUrl ? `<a href="${escapeHtml(d.downloadUrl)}" target="_blank" rel="noopener">${escapeHtml(d.title)}</a>` : escapeHtml(d.title)}${d.description ? `<span>${escapeHtml(d.description)}</span>` : ''}</li>`).join('')}</ul>`;
}

function placedItemsTable(items) {
  if (!items.length) return '<p class="spcd-muted">Nog geen gestructureerde onderdelen beschikbaar.</p>';
  return `<table class="spcd-table"><thead><tr><th>Aantal</th><th>Onderdeel</th><th>Specificaties</th><th>Documenten</th></tr></thead><tbody>${items.map(item => {
    const docs = [
      item.datasheetUrl ? `<a href="${escapeHtml(item.datasheetUrl)}" target="_blank" rel="noopener">Datasheet</a>` : '',
      item.manualUrl ? `<a href="${escapeHtml(item.manualUrl)}" target="_blank" rel="noopener">Handleiding</a>` : '',
    ].filter(Boolean).join(' · ') || 'Nog te koppelen';
    return `<tr><td>${escapeHtml(`${item.qty}x`)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.specs || '—')}</td><td>${docs}</td></tr>`;
  }).join('')}</tbody></table>`;
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

export function renderClosingDossierEditorModalHtml(drafts = {}) {
  const field = (key, label, rows = 4) => `
    <div class="mb-3">
      <label class="form-label" for="spClosing_${key}">${escapeHtml(label)}</label>
      <textarea id="spClosing_${key}" class="form-control" rows="${rows}" data-closing-text="${escapeHtml(key)}">${escapeHtml(drafts[key] || '')}</textarea>
    </div>`;
  return `
    <div class="modal fade" id="spClosingDossierModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Afsluitdossier voorbereiden</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluit"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small">Pas deze klantgerichte teksten aan vóór de PDF/print-preview wordt gemaakt. Interne projectopmerkingen worden niet opgenomen.</p>
            ${field('projectSummary', 'Projectoverzicht', 4)}
            ${field('originalRequest', 'Originele aanvraag', 5)}
            ${field('solutionSummary', 'Geplaatste / voorziene oplossing', 4)}
            ${field('technicalSummary', 'Technische toelichting', 4)}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuleren</button>
            <button type="button" class="btn btn-primary" data-closing-generate>Afsluitdossier openen</button>
          </div>
        </div>
      </div>
    </div>`;
}

export function closingDossierStyles() {
  return `
    <style>
      :root{--spcd-primary:${BRAND.primary};--spcd-primary-dark:${BRAND.primaryDark};--spcd-success:${BRAND.success};--spcd-warning:${BRAND.warning};--spcd-bg:${BRAND.bg};--spcd-border:${BRAND.border};--spcd-text:${BRAND.text};--spcd-muted:${BRAND.muted};}
      *{box-sizing:border-box} body.spcd-body{margin:0;font-family:"Segoe UI",Inter,Arial,sans-serif;color:var(--spcd-text);background:#fff;font-size:14px;line-height:1.45}.spcd-printbar{position:sticky;top:0;z-index:10;display:flex;gap:.5rem;justify-content:flex-end;padding:.75rem 1rem;background:rgba(255,255,255,.94);border-bottom:1px solid var(--spcd-border);backdrop-filter:blur(8px)}.spcd-printbar button{border:0;border-radius:999px;background:linear-gradient(135deg,var(--spcd-primary),var(--spcd-success));color:white;font-weight:700;padding:.65rem 1rem;cursor:pointer}.spcd-cover{min-height:100vh;padding:72px 56px;background:radial-gradient(circle at 84% 84%,rgba(44,123,229,.12),transparent 34%),radial-gradient(circle at 88% 8%,rgba(0,180,120,.16),transparent 30%),linear-gradient(135deg,#f8fbff,#edf4ff 55%,#eafff7);position:relative;overflow:hidden}.spcd-brand{font-weight:850;color:var(--spcd-primary-dark);font-size:34px;letter-spacing:-.05em}.spcd-subtitle{font-size:13px;color:var(--spcd-muted);font-weight:700;letter-spacing:0}.spcd-cover h1{margin:112px 0 18px;max-width:760px;font-size:52px;line-height:1.05;letter-spacing:-.07em;color:#10233f}.spcd-lead{max-width:660px;font-size:18px;color:#51627d}.spcd-cover-card{margin-top:70px;max-width:640px;background:rgba(255,255,255,.88);border:1px solid rgba(220,227,240,.95);border-radius:22px;padding:38px;box-shadow:0 24px 58px rgba(30,42,58,.10)}.spcd-meta-grid,.spcd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 24px}.spcd-label{text-transform:uppercase;color:#7b8baa;font-size:11px;letter-spacing:.08em;font-weight:800}.spcd-value{margin-top:5px;font-weight:750;color:#17243a}.spcd-page{padding:0 0 32px}.spcd-card{break-inside:avoid;margin:0 0 28px;padding:30px 32px;border:1px solid var(--spcd-border);border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(30,42,58,.045)}.spcd-card h2{margin:0 0 20px;font-size:26px;letter-spacing:-.045em;color:#17365f;display:flex;align-items:center;gap:10px}.spcd-card h2:before{content:"";width:7px;height:25px;border-radius:999px;background:linear-gradient(var(--spcd-primary),var(--spcd-success))}.spcd-card h3{font-size:18px;margin:24px 0 12px}.spcd-copy{font-size:15px;color:#33435c;white-space:pre-wrap}.spcd-fact{background:#f7f9fd;border:1px solid var(--spcd-border);border-radius:13px;padding:16px;min-height:74px}.spcd-callout{border-left:4px solid var(--spcd-success);background:#effbf6;padding:15px 18px;border-radius:12px;margin-top:16px}.spcd-callout-warning{border-left-color:var(--spcd-warning);background:#fff8eb}.spcd-muted{color:var(--spcd-muted)}table.spcd-table{width:100%;border-collapse:collapse}table.spcd-table th,table.spcd-table td{padding:12px;border-bottom:1px solid var(--spcd-border);text-align:left;vertical-align:top}table.spcd-table th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--spcd-muted)}code{background:#edf4ff;color:#10233f;border-radius:6px;padding:3px 7px}.spcd-doc-list{margin:0;padding-left:18px}.spcd-doc-list li{margin-bottom:8px}.spcd-doc-list span{display:block;color:var(--spcd-muted);font-size:12px}.spcd-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.spcd-photo-grid figure{margin:0;border:1px solid var(--spcd-border);border-radius:16px;overflow:hidden;background:#fff;break-inside:avoid}.spcd-photo-grid img,.spcd-photo-placeholder{width:100%;height:320px;object-fit:contain;display:flex;align-items:center;justify-content:center;background:#eef3fb;color:var(--spcd-muted)}.spcd-photo-grid figcaption{padding:12px 14px}.spcd-photo-grid figcaption span{display:block;color:var(--spcd-muted);font-size:12px;margin-top:2px;word-break:break-word}.spcd-break{break-before:page}@media print{.spcd-printbar{display:none}.spcd-cover{min-height:100vh}.spcd-card{box-shadow:none;margin-bottom:18px}.spcd-photo-grid img,.spcd-photo-placeholder{height:260px}a{color:inherit;text-decoration:none}}@media(max-width:760px){.spcd-cover{padding:42px 24px}.spcd-cover h1{font-size:40px;margin-top:72px}.spcd-meta-grid,.spcd-grid,.spcd-photo-grid{grid-template-columns:1fr}.spcd-card{padding:24px 20px}}
    </style>
  `;
}

export function renderClosingDossierHtml(model, options = {}) {
  const generatedDate = formatDate(model.generatedAt);
  const defaults = buildClosingDossierDraftTexts(model);
  const texts = { ...defaults, ...(options.texts || {}) };
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
      <div class="spcd-brand">SmartPeak<div class="spcd-subtitle">Slim omgaan met jouw energie</div></div>
      <h1>${escapeHtml(model.title)}</h1>
      <p class="spcd-lead">Een gebundeld overzicht van de installatie, technische gegevens, documenten, foto’s en praktische opvolging.</p>
      <div class="spcd-cover-card"><div class="spcd-meta-grid">
        ${fact('Klant', model.customer.name)}${fact('Projectstatus', model.status)}${fact('Adres', model.customer.address)}${fact('Keuring gepland', model.planning.inspectionPlannedDate)}${fact('Contact', [model.customer.email, model.customer.phone].filter(Boolean).join(' · '))}${fact('Dossierdatum', generatedDate)}
      </div></div>
    </section>
    <main class="spcd-page">
      ${section('Projectoverzicht', `${paragraph(texts.projectSummary)}<div class="spcd-grid">${fact('Klant', model.customer.name)}${fact('Adres', model.customer.address)}${fact('E-mail', model.customer.email)}${fact('Telefoon', model.customer.phone)}${fact('EAN-code', model.meter.eanCode)}${fact('Meter', `${model.meter.meterType}${model.meter.meterNumber ? ` · ${model.meter.meterNumber}` : ''}`)}</div>`)}
      ${section('Originele aanvraag', paragraph(texts.originalRequest))}
      ${section('Geplaatste / voorziene oplossing', `${paragraph(texts.solutionSummary)}<div class="spcd-grid">${fact('Configuratie', model.solution.description)}${fact('Batterijcapaciteit', model.solution.batteryCapacity)}${fact('Batterij-omvormer', model.solution.batteryInverter)}${fact('PV-omvormer', model.solution.pvInverter)}${fact('Offerte', model.solution.offerte)}${fact('Keuring', model.planning.inspectionPlannedDate !== 'Nog niet ingevuld' || model.planning.inspectionDoneDate !== 'Nog niet ingevuld' ? 'Voorzien' : 'Nog te bevestigen')}</div><h3>Geplaatste onderdelen</h3>${placedItemsTable(model.placedItems)}`)}
      ${section('Technische gegevens en metingen', `${paragraph(texts.technicalSummary)}<table class="spcd-table"><tbody>${tableRows(model.technicalRows, 'Nog geen technische metingen geregistreerd.')}</tbody></table>`)}
      ${section('Verbruik / injectie samenvatting', `<p class="spcd-muted">Compacte context, zonder ROI-detail of terugverdientijd.</p><div class="spcd-grid">${fact('CSV-periode', model.energyContext.period)}${fact('Afname jaarvenster', model.energyContext.totalAfname)}${fact('Injectie jaarvenster', model.energyContext.totalInjectie)}${fact('Energieprijs gebruikt', model.energyContext.effectivePrice)}</div><div class="spcd-callout spcd-callout-warning">De berekening zelf wordt niet opgenomen in dit afsluitdossier.</div>`)}
      ${section('Planning en keuring', `<div class="spcd-grid">${fact('Plaatsbezoek uitgevoerd', model.planning.visitDoneDate)}${fact('Installatie afgerond', model.planning.installationDoneDate)}${fact('Keuring gepland', model.planning.inspectionPlannedDate)}${fact('Keuring afgerond', model.planning.inspectionDoneDate)}</div>`)}
      ${section('Serienummers', `<table class="spcd-table"><thead><tr><th>Categorie</th><th>Serienummer</th><th>Bron</th></tr></thead><tbody>${serialRows(model.serialNumbers)}</tbody></table>`)}
      ${section('Documenten en bijlagen', docCards)}
      ${section('Foto’s huidige / bekeken situatie', photoGrid(model.photos.situation, 'Situatiefoto'), 'spcd-break')}
      ${section('Foto’s serienummers', photoGrid(model.photos.serial, 'Serienummerfoto'), 'spcd-break')}
    </main>
  </body></html>`;
}

export function openClosingDossierPrintWindow(model, targetWindow = null, options = {}) {
  const html = renderClosingDossierHtml(model, options);
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
    buildClosingDossierDraftTexts,
    renderClosingDossierEditorModalHtml,
    renderClosingDossierHtml,
    openClosingDossierPrintWindow,
  };
}
