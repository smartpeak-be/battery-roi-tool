import { escapeHtml } from '../shared-helpers.js';
import { buildAllDaysFromDailyCompact } from '../calc-engine.js';
import { LEAD_DEFAULTS, buildPublicIndication } from '../lead-calc.js';

// Customer-facing result of the lead wizard. SmartPeak deliberately shows no payback time and no
// installation price: they depend on too many things that change (prices, contract, rules, plans).
// The page shows what the customer's own data says, what a battery would roughly do with it and
// the yearly saving that self-consumption alone allows ("up to").

/** The public indication, computed from the stored daily data (also for leads from before it existed). */
export function publicIndication(lead) {
  const dc = lead.csvDailyCompact;
  if (!dc || !dc.startDate || !Array.isArray(dc.afname) || !dc.afname.length) return null;
  const price = lead.pricePerKwh > 0 ? lead.pricePerKwh : LEAD_DEFAULTS.pricePerKwh;
  try {
    return buildPublicIndication(buildAllDaysFromDailyCompact(dc), price);
  } catch {
    return null;
  }
}

/** Yearly totals from the stored daily data, scaled to 365 days when the period is shorter. */
export function yearlyFigures(lead, indication = publicIndication(lead)) {
  const dc = lead.csvDailyCompact;
  if (!dc || !Array.isArray(dc.afname) || dc.afname.length === 0) return null;
  const days = dc.afname.length;
  const scale = 365 / days;
  const sum = (arr) => (Array.isArray(arr) ? arr : []).reduce((s, v) => s + (v || 0), 0);
  const afname = sum(dc.afname) * scale;
  const injectie = sum(dc.injectie) * scale;
  let stored = null;
  if (indication) {
    const kwh = Math.min(indication.storedKwhPerYear, afname);
    return { days, afname, injectie, stored: { min: kwh, max: kwh } };
  }
  const r = lead.result;
  const price = lead.pricePerKwh;
  if (r && price > 0) {
    const saving = rVal(r.annualSavingEur);
    stored = {
      min: Math.min(saving.min / price, afname),
      max: Math.min(saving.max / price, afname)
    };
  }
  return { days, afname, injectie, stored };
}

export function renderResult(lead) {
  const ind = publicIndication(lead);
  const y = yearlyFigures(lead, ind);
  const r = lead.result;
  const parts = [];
  if (ind && y) {
    parts.push(heroCard(y, ind), dataCard(y, { min: ind.capacityKwh, max: ind.capacityKwh }, true), savingCard(ind, lead), usageChartCard(lead));
  } else if (r && y && y.stored) {
    parts.push(heroCard(y), dataCard(y, r.batteryCapKwh), usageChartCard(lead));
  } else {
    parts.push(noSizeCard(y), y ? usageChartCard(lead) : '');
  }
  parts.push(
    ctaCard('btnContact', 'Plan een vrijblijvend gesprek', 'We bekijken het graag samen met je'),
    whyNoPaybackCard(),
    faqCard(),
    packageCard(),
    ctaCard('btnContactBottom', 'Plan een vrijblijvend gesprek', 'Klaar voor de volgende stap?'),
    renderDisclaimer(lead)
  );
  return parts.join('');
}

export function rVal(field) {
  if (field && typeof field === 'object' && 'min' in field) return field;
  return { min: field, max: field };
}

function heroCard(y, ind) {
  const saving = ind ? `
      <div class="sp-hero-subtitle mt-3">Dat is een besparing <strong>tot ${fmtEur(ind.savingUpToEur)} per jaar</strong>, enkel door meer van je eigen zonne-energie zelf te gebruiken.</div>` : '';
  return `
    <div class="sp-result-card sp-hero-card text-center">
      <div class="sp-hero-eyebrow">Op basis van jouw eigen verbruik</div>
      <div class="sp-hero-amount">${fmtKwhRange(y.stored)}<span class="sp-hero-amount-unit"> per jaar</span></div>
      <div class="sp-hero-subtitle">van je eigen zonne-energie kan je met een batterij zelf gebruiken, in plaats van ze op het net te zetten en later terug te kopen.</div>${saving}
    </div>
  `;
}

function savingCard(ind, lead) {
  const own = lead.defaultsUsed && lead.defaultsUsed.pricePerKwh === false;
  const priceTxt = `${fmtNl(ind.pricePerKwh, 2)} euro per kWh`;
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-3">Hoe we die besparing berekenen</h5>
      <ul class="mb-3">
        <li>We gaan uit van een batterij van ongeveer ${fmtNl(ind.capacityKwh, 1)} kWh: de grootte die je met je zonne-overschot op minstens 100 dagen per jaar volledig kan laden.</li>
        <li>Elke kWh die de batterij 's avonds of 's nachts levert, hoef je niet van het net te halen. Die kWh rekenen we aan ${own ? `jouw prijs van ${priceTxt}` : `${priceTxt}, een gangbare prijs met alles inbegrepen`}.</li>
      </ul>
      <p class="mb-0">Het gaat hier enkel om <strong>zelfverbruik</strong>. Met een dynamisch energiecontract kan een batterij ook laden wanneer stroom goedkoop is en ontladen wanneer ze duur is. Dan is mogelijk een grotere besparing haalbaar, net als wanneer de batterij je piek voor het capaciteitstarief beperkt. Dat bekijken we graag samen met je.</p>
    </div>
  `;
}

function dataCard(y, capacity, fromData = false) {
  const after = { min: Math.max(0, y.afname - y.stored.max), max: Math.max(0, y.afname - y.stored.min) };
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-1">Wat we in jouw gegevens zien</h5>
      <div class="sp-result-metrics">
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtKwh(y.injectie)}</div>
          <div class="sp-result-metric-label">Naar het net per jaar</div>
          <div class="sp-metric-detail">Zonne-energie die je nu niet zelf gebruikt.</div>
        </div>
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtKwh(y.afname)}</div>
          <div class="sp-result-metric-label">Van het net per jaar</div>
          <div class="sp-metric-detail">Met een batterij wordt dat ongeveer ${fmtKwhRange(after)}.</div>
        </div>
        <div class="sp-metric-tile">
          <div class="sp-result-metric-value">${fmtRange(capacity, 1, ' kWh')}</div>
          <div class="sp-result-metric-label">Indicatieve batterijgrootte</div>
          <div class="sp-metric-detail">${fromData ? 'Wat je overschot op minstens 100 dagen per jaar volledig vult. ' : ''}Een vertrekpunt. De juiste grootte hangt ook af van je wensen en plannen.</div>
        </div>
      </div>
    </div>
  `;
}

function noSizeCard(y) {
  const figures = y ? `
      <p class="mb-3">In jouw gegevens zien we per jaar ongeveer <strong>${fmtKwh(y.injectie)}</strong> zonne-energie die naar het net gaat en <strong>${fmtKwh(y.afname)}</strong> die je van het net haalt.</p>` : '';
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-3">Jouw batterij-analyse</h5>
      ${figures}
      <p class="mb-2">Uit je verbruiksgegevens alleen komt geen duidelijke batterijgrootte naar voren. Dat gebeurt bijvoorbeeld als er weinig zonne-energie naar het net gaat, of als de periode in je bestand kort is.</p>
      <p class="mb-2">Dat wil niet zeggen dat een batterij niets voor jou is. Ze kan ook zinvol zijn om:</p>
      <ul>
        <li>je piekverbruik af te vlakken en zo te besparen op het capaciteitstarief,</li>
        <li>je elektrische wagen of warmtepomp slimmer te laten werken,</li>
        <li>goedkoop te laden met een dynamisch energiecontract,</li>
        <li>een deel van je woning te blijven voeden bij een stroomonderbreking.</li>
      </ul>
      <p class="mb-0">We bekijken graag samen wat in jouw situatie zinvol is.</p>
    </div>
  `;
}

function usageChartCard(lead) {
  if (!lead.csvDailyCompact || !Array.isArray(lead.csvDailyCompact.afname)) return '';
  const days = lead.csvDailyCompact.afname.length;
  const periodTxt = days >= 365 ? 'een volledig jaar' : `${days} dagen`;
  const withBattery = Boolean(lead.result);
  const caption = withBattery
    ? 'Het <span class="sp-chart-caption-injection">groen</span> is jouw zonne-energie naar het net. Het <span class="sp-chart-caption-battery">blauw</span> is wat een batterij daarvan ongeveer zou opvangen. Het <span class="sp-chart-caption-grid">rood</span> is wat je nu van het net haalt.'
    : 'Het <span class="sp-chart-caption-injection">groen</span> is jouw zonne-energie naar het net. Het <span class="sp-chart-caption-grid">rood</span> is wat je van het net haalt.';
  return `
    <div class="sp-result-card" id="usageChartCard">
      <h5 class="text-center mb-2">Berekend op jouw eigen Fluvius-data</h5>
      <p class="text-center text-muted small mb-4">Deze analyse is gebaseerd op <strong>${periodTxt}</strong> van jouw werkelijke verbruik, per maand.</p>
      <div class="sp-chart-wrap">
        <canvas id="usageChart" aria-label="Maandelijkse afname en injectie"></canvas>
      </div>
      <p class="sp-chart-caption">${caption}</p>
    </div>
  `;
}

function whyNoPaybackCard() {
  return `
    <div class="sp-result-card">
      <h5 class="text-center mb-3">Waarom geen terugverdientijd?</h5>
      <p class="mb-2">Wat een batterij je uiteindelijk oplevert, hangt af van veel zaken die bovendien veranderen:</p>
      <ul>
        <li>je energieprijs en het soort contract (vast, variabel of dynamisch),</li>
        <li>het capaciteitstarief en hoe hoog je pieken zijn,</li>
        <li>wat je later nog plant, zoals een elektrische wagen of een warmtepomp,</li>
        <li>de regels voor injectie en de vergoeding die je ervoor krijgt,</li>
        <li>hoe de batterij gestuurd wordt.</li>
      </ul>
      <p class="mb-0">Een terugverdientijd in jaren lijkt precies, maar is dat niet. Daarom kijken we liever samen naar je verbruik, je wensen en je plannen, en stellen we de oplossing voor die daar het best bij past.</p>
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
      <p class="sp-cta-sub">Geen verplichting · Antwoord binnen 24&nbsp;uur</p>
    </div>
  `;
}

function faqCard() {
  const items = [
    {
      q: 'Wat als er stroomuitval is?',
      a: 'Een batterij mag tijdens een stroomonderbreking nooit stroom naar het net sturen. Zonder extra voorziening valt je installatie dan ook uit. Veel systemen hebben een noodstopcontact waarop je enkele toestellen kan aansluiten, zoals de koelkast of het internet. Met een back-upschakeling in je verdeelkast kan een geschikt systeem ook (een deel van) je woning blijven voeden. Dat vraagt een grotere aanpassing en investering, die we vooraf met je bespreken.'
    },
    {
      q: 'Hoe lang gaat een thuisbatterij mee?',
      a: 'Een moderne lithiumbatterij gaat doorgaans 10 tot 15 jaar mee, vaak langer. De opslagcapaciteit neemt in die tijd geleidelijk af, maar de batterij blijft bruikbaar. De fabrieksgarantie verschilt per merk, meestal 10 jaar of een gegarandeerd aantal laadcycli. We vermelden ze in je offerte.'
    },
    {
      q: 'Hoeveel ruimte heb ik nodig?',
      a: 'Dat hangt af van het systeem en de grootte. Reken voor de meeste installaties op 60 cm tot 1 m breed en 30 tot 50 cm diep. De batterij komt aan de muur of op de grond, binnen of in de garage. Tijdens het plaatsbezoek bepalen we samen de beste plek.'
    },
    {
      q: 'Werkt dit met mijn bestaande zonnepanelen?',
      a: 'In de meeste gevallen wel. We werken met wat er al is: je panelen en omvormer blijven, tenzij een andere opstelling beter past bij je plannen. We controleren ook of je zekeringkast en aansluiting geschikt zijn.'
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
      <h5 class="text-center mb-3">Wat zit er in een installatie van SmartPeak?</h5>
      <ul class="sp-package-list">
        <li><i class="fa-solid fa-check icon-ok"></i> Levering van de batterij en bijhorende componenten</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Plaatsing en aansluiting in de zekeringkast</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Instellen van het laden en ontladen op jouw verbruik</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Bebat-bijdragen</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Verplichte AREI-keuring na installatie</li>
        <li><i class="fa-solid fa-check icon-ok"></i> Opvolging van je installatie in de eerste periode na de plaatsing</li>
      </ul>
    </div>
  `;
}

function renderDisclaimer(lead) {
  const defaults = [];
  if (lead.defaultsUsed) {
    if (lead.defaultsUsed.pvInverterKw) defaults.push(`<li>Omvormervermogen: standaardwaarde ${fmtNl(LEAD_DEFAULTS.pvInverterKw, 1)} kW gebruikt</li>`);
    if (lead.defaultsUsed.pricePerKwh) defaults.push(`<li>Energiekost: standaardwaarde ${fmtNl(lead.pricePerKwh > 0 ? lead.pricePerKwh : LEAD_DEFAULTS.pricePerKwh, 2)} EUR/kWh gebruikt</li>`);
    if (lead.defaultsUsed.houseAgeOver10Years) defaults.push('<li>BTW: 21% (woningtype niet opgegeven)</li>');
  }
  const defaultsHtml = defaults.length ? `<p class="mb-1 mt-2"><small>Aannames:</small></p><ul>${defaults.join('')}</ul>` : '';
  return `
    <div class="sp-lead-disclaimer">
      ${defaultsHtml}
      <p class="mb-0"><small>Dit resultaat is een eerste indicatie op basis van je dagelijkse meetgegevens. Het houdt geen rekening met je pieken, je energiecontract of je plannen. Die bekijken we graag samen met je.</small></p>
    </div>
  `;
}

function fmtEur(n) {
  return `€ ${Math.round(n).toLocaleString('nl-BE')}`;
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

// Rounded to 10 kWh: the data is a daily total, more precision would suggest too much.
function roundKwh(n) {
  return Math.round(n / 10) * 10;
}

function fmtKwh(n) {
  return `${roundKwh(n).toLocaleString('nl-BE')} kWh`;
}

function fmtKwhRange(range) {
  const a = roundKwh(range.min);
  const b = roundKwh(range.max);
  if (a === b) return `± ${a.toLocaleString('nl-BE')} kWh`;
  return `${a.toLocaleString('nl-BE')} tot ${b.toLocaleString('nl-BE')} kWh`;
}
