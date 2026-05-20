import { escapeHtml } from '../shared-helpers.js';

export function renderProfitable(lead) {
  const r = lead.result;
  const recFull = rVal(r.recoveryPctFull);
  const recPartial = rVal(r.recoveryPctPartial);
  const selfPct = Math.max(0, Math.min(100, (recFull.max || 0) + (recPartial.max || 0)));

  let energyBar = null;
  if (lead.csvDailyCompact && Array.isArray(lead.csvDailyCompact.afname)) {
    const days = lead.csvDailyCompact.afname.length;
    const scale = days > 0 ? 365 / days : 0;
    const annualAfname = lead.csvDailyCompact.afname.reduce((s, v) => s + (v || 0), 0) * scale;
    const annualInj = lead.csvDailyCompact.injectie.reduce((s, v) => s + (v || 0), 0) * scale;
    const batteryKwh = Math.round(annualAfname * (selfPct / 100));
    const gridKwh = Math.round(annualAfname - batteryKwh);
    const injKwh = Math.round(annualInj);
    const total = injKwh + annualAfname;
    if (total > 0) {
      energyBar = {
        injPct: (injKwh / total) * 100,
        batPct: (batteryKwh / total) * 100,
        gridPct: (gridKwh / total) * 100,
        injKwh,
        batteryKwh,
        gridKwh,
      };
    }
  }

  return `
    ${heroCard(r)}
    ${solutionCard(r)}
    ${energyFlowCard(energyBar)}
    ${usageChartCard(lead)}
    ${ctaCard('btnContact', 'Plan een vrijblijvend gesprek', 'Wij rekenen het exact uit voor jouw woning')}
    ${faqCard()}
    ${packageCard()}
    ${ctaCard('btnContactBottom', 'Plan een vrijblijvend gesprek', 'Klaar voor de volgende stap?')}
    ${renderDisclaimer(lead)}
  `;
}

export function renderNotProfitable(lead) {
  return `
    <div class="sp-result-card text-center">
      <h5 class="mb-3">Jouw batterij-analyse</h5>
      <p class="mb-3">Op basis van je huidige verbruiksprofiel verdient een thuisbatterij zich vandaag nog niet binnen een redelijke termijn terug.</p>
      <p class="mb-0 text-start">Dat kan veranderen wanneer:</p>
      <ul class="text-start">
        <li>de energieprijzen stijgen,</li>
        <li>je elektriciteitsverbruik toeneemt (bv. warmtepomp of elektrische wagen),</li>
        <li>de injectievergoeding verder daalt.</li>
      </ul>
      <p class="mb-0">We bekijken graag samen of er andere opties zijn voor jouw situatie.</p>
    </div>
    ${ctaCard('btnContact', 'Plan een vrijblijvend gesprek', 'We denken graag mee')}
    ${renderDisclaimer(lead)}
  `;
}

export function rVal(field) {
  if (field && typeof field === 'object' && 'min' in field) return field;
  return { min: field, max: field };
}

function heroCard(r) {
  return `
    <div class="sp-result-card sp-hero-card text-center">
      <div class="sp-hero-eyebrow">Op basis van jouw eigen verbruik</div>
      <div class="sp-hero-amount">${fmtEurRange(r.annualSavingEur)}<span class="sp-hero-amount-unit"> per jaar</span></div>
      <div class="sp-hero-subtitle">bespaar je op je elektriciteitsfactuur</div>
    </div>
  `;
}

function solutionCard(r) {
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-1">Jouw aanbevolen oplossing</h5>
      <div class="sp-result-metrics">
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtRange(r.batteryCapKwh, 1, ' kWh')}</div>
          <div class="sp-result-metric-label">Opslagcapaciteit</div>
          <div class="sp-metric-detail">Genoeg voor een avond koken, wassen en TV kijken op opgeslagen zonne-energie.</div>
        </div>
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtRange(r.batteryInverterKw, 1, ' kW')}</div>
          <div class="sp-result-metric-label">Omvormvermogen</div>
          <div class="sp-metric-detail">Snel genoeg om je piekverbruik op te vangen, ook als de waterkoker en oven samen draaien.</div>
        </div>
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtRange(r.roiYears, 1, ' jaar')}</div>
          <div class="sp-result-metric-label">Terugverdientijd</div>
          <div class="sp-metric-detail">Vanaf dan verdient de batterij elk jaar geld op je energiefactuur.</div>
        </div>
      </div>
    </div>
  `;
}

function energyFlowCard(bar) {
  if (!bar) return '';
  const labelIf = (pct, txt) => pct >= 12 ? `<span class="sp-self-bar-label">${txt}</span>` : '';
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-2">Jouw energiestromen op jaarbasis</h5>
      <p class="text-center text-muted small mb-4">Vandaag gaat jouw overtollige zonne-energie naar het net. Met een batterij sla je een deel daarvan op voor 's avonds en 's nachts.</p>
      <div class="sp-self-bar" role="img" aria-label="Injectie ${bar.injKwh} kWh, Batterij ${bar.batteryKwh} kWh, Net ${bar.gridKwh} kWh">
        <div class="sp-self-bar-fill injection" style="width:${bar.injPct}%">
          ${labelIf(bar.injPct, fmtNl(bar.injPct, 0) + '%')}
        </div>
        <div class="sp-self-bar-fill battery" style="width:${bar.batPct}%">
          ${labelIf(bar.batPct, fmtNl(bar.batPct, 0) + '%')}
        </div>
        <div class="sp-self-bar-fill grid" style="width:${bar.gridPct}%">
          ${labelIf(bar.gridPct, fmtNl(bar.gridPct, 0) + '%')}
        </div>
      </div>
      <div class="sp-self-legend">
        <span><span class="sp-self-dot injection"></span> Injectie (${bar.injKwh.toLocaleString('nl-BE')} kWh)</span>
        <span><span class="sp-self-dot battery"></span> Batterij (${bar.batteryKwh.toLocaleString('nl-BE')} kWh)</span>
        <span><span class="sp-self-dot grid"></span> Van het net (${bar.gridKwh.toLocaleString('nl-BE')} kWh)</span>
      </div>
    </div>
  `;
}

function usageChartCard(lead) {
  if (!lead.csvDailyCompact || !Array.isArray(lead.csvDailyCompact.afname)) return '';
  const days = lead.csvDailyCompact.afname.length;
  const periodTxt = lead.result && lead.result.isFullYear
    ? 'een volledig jaar'
    : `${days} dagen`;
  return `
    <div class="sp-result-card" id="usageChartCard">
      <h5 class="text-center mb-2">Berekend op jouw eigen Fluvius-data</h5>
      <p class="text-center text-muted small mb-4">Deze analyse is gebaseerd op <strong>${periodTxt}</strong> van jouw werkelijke verbruik.</p>
      <div class="sp-chart-wrap">
        <canvas id="usageChart" aria-label="Maandelijks verbruik, injectie en batterijbesparing"></canvas>
      </div>
      <p class="sp-chart-caption">Het <span class="sp-chart-caption-injection">groen</span> is jouw zonne-energie naar het net. Het <span class="sp-chart-caption-battery">blauw</span> is wat de batterij daarvan opvangt. Het <span class="sp-chart-caption-grid">rood</span> is jouw resterende netverbruik.</p>
    </div>
  `;
}

function ctaCard(btnId, btnText, eyebrow) {
  return `
    <div class="sp-result-card sp-cta-card text-center">
      ${eyebrow ? `<div class="sp-cta-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <button type="button" class="btn btn-primary btn-lg sp-cta-button" id="${btnId}">
        <i class="fa-solid fa-phone" aria-hidden="true"></i> ${escapeHtml(btnText)}
      </button>
      <p class="sp-cta-sub">Geen verplichting · Plaatsbezoek gratis · Antwoord binnen 24&nbsp;uur</p>
    </div>
  `;
}

function faqCard() {
  const items = [
    {
      q: 'Wat als er stroomuitval is?',
      a: 'Bij een stroomonderbreking mag een thuisbatterij wettelijk geen stroom terugleveren aan de woning. Wel beschikken de meeste batterijen over een noodstopcontact dat automatisch actief wordt. Via een verlengkabel kan je dan alsnog kritische toestellen (koelkast, oplader, internet) van stroom voorzien, maar niet de volledige woning overnemen. Er bestaan batterijsystemen die dat wel kunnen, maar dan spreken we over een hogere investering en ingrijpende aanpassingen aan de verdeelkast. Voor de kleinere en stekkerklare batterijen is dat niet mogelijk.'
    },
    {
      q: 'Hoe lang gaat een thuisbatterij mee?',
      a: 'Een moderne lithium-batterij gaat doorgaans 12 tot 15 jaar mee, en vaak langer. Gedurende die levensduur vermindert de opslagcapaciteit geleidelijk. Na 10 jaar kan je bijvoorbeeld nog zo\'n 80% van de oorspronkelijke capaciteit verwachten. De batterij blijft daarmee perfect bruikbaar. Wij werken enkel met merken die minimaal 10 jaar fabrieksgarantie of een gegarandeerd aantal laadcycli aanbieden.'
    },
    {
      q: 'Hoeveel ruimte heb ik nodig?',
      a: 'Dat hangt af van de installatie: één toestel of meerdere. Voor de meeste installaties kan je rekenen op 60 cm tot 1 m breed, 30 tot 50 cm diep en 40 tot 60 cm hoog. De batterij wordt aan de muur of op de grond geplaatst, binnen of in de garage. Tijdens het plaatsbezoek bepalen we samen de beste plek.'
    },
    {
      q: 'Werkt dit met mijn bestaande zonnepanelen?',
      a: 'Ja. We sluiten de batterij parallel aan op je elektriciteitskast. Je bestaande omvormer en panelen hoeven niet vervangen te worden. We controleren wel of je zekeringskast en aansluiting geschikt zijn.'
    }
  ];
  const itemsHtml = items.map((it, i) => `
    <div class="accordion-item">
      <h2 class="accordion-header" id="faqHead${i}">
        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                data-bs-target="#faqBody${i}" aria-expanded="false" aria-controls="faqBody${i}">
          ${escapeHtml(it.q)}
        </button>
      </h2>
      <div id="faqBody${i}" class="accordion-collapse collapse" aria-labelledby="faqHead${i}" data-bs-parent="#leadFaq">
        <div class="accordion-body">${escapeHtml(it.a)}</div>
      </div>
    </div>
  `).join('');
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-3">Veelgestelde vragen</h5>
      <div class="accordion" id="leadFaq">${itemsHtml}</div>
    </div>
  `;
}

function packageCard() {
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-3">Wat zit in de prijs?</h5>
      <ul class="sp-package-list">
        <li><i class="fa-solid fa-check icon-ok"></i> Levering van de batterij en bijhorende componenten</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Plaatsing en aansluiting in de zekeringskast</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Configuratie van laad- en ontlaadschema's voor maximale besparing</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Bebat-bijdragen</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Verplichte AREI-keuring na installatie</li>
      </ul>
    </div>
  `;
}

function renderDisclaimer(lead) {
  const defaults = [];
  if (lead.defaultsUsed) {
    if (lead.defaultsUsed.pvInverterKw) defaults.push('<li>Omvormervermogen: standaardwaarde 3,5 kW gebruikt</li>');
    if (lead.defaultsUsed.pricePerKwh) defaults.push('<li>Energiekost: standaardwaarde 0,34 EUR/kWh gebruikt</li>');
    if (lead.defaultsUsed.houseAgeOver10Years) defaults.push('<li>BTW: 21% (woningtype niet opgegeven)</li>');
  }
  const defaultsHtml = defaults.length ? `<p class="mb-1 mt-2"><small>Aannames:</small></p><ul>${defaults.join('')}</ul>` : '';
  return `
    <div class="sp-lead-disclaimer">
      ${defaultsHtml}
      <p class="mb-0"><small>Dit resultaat is een indicatie op basis van de beschikbare gegevens en gebruikt het realistische scenario. Voor een nauwkeurige berekening op maat nemen we graag contact met je op.</small></p>
    </div>
  `;
}

function fmtNl(n, decimals = 1) {
  return Number(n).toFixed(decimals).replace('.', ',');
}

function fmtRange(field, decimals = 1, suffix = '') {
  const { min, max } = rVal(field);
  const a = fmtNl(min, decimals);
  const b = fmtNl(max, decimals);
  if (a === b) return a + suffix;
  return `${a} tot ${b}${suffix}`;
}

function fmtEurRange(field) {
  const { min, max } = rVal(field);
  const a = Math.round(min).toLocaleString('nl-BE');
  const b = Math.round(max).toLocaleString('nl-BE');
  if (a === b) return `€${a}`;
  return `€${a} – €${b}`;
}
