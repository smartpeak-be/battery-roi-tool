// Result of the public verbruiksanalyse on smartpeak.be, as HTML for the lead-wizard widget.
// Pure (no DOM), so it can be tested. The numbers come from buildPublicIndication (lead-calc.js):
// a sensible capacity, the kWh used from the battery and the yearly saving on self-consumption.
// Never a payback time or an installation price.

const nl = (n, decimals = 1) => Number(n).toFixed(decimals).replace('.', ',');
const kwh = (n) => `${(Math.round(n / 10) * 10).toLocaleString('nl-BE')} kWh`;
const eur = (n) => `€ ${Math.round(n).toLocaleString('nl-BE')}`;

/** Yearly grid totals from the CSV days, scaled to a year when the file is shorter. */
export function yearlyTotals(allDays) {
  const days = allDays.slice(-365);
  const scale = 365 / (days.length || 1);
  const sum = (key) => days.reduce((s, d) => s + (d[key] || 0), 0) * scale;
  return { days: days.length, afname: sum('afname'), injectie: sum('injectie') };
}

function periodText(totals) {
  return totals.days >= 365
    ? 'je verbruik van het afgelopen jaar'
    : `${totals.days} dagen verbruik, omgerekend naar een jaar`;
}

/**
 * @param {object|null} ind      buildPublicIndication(...) or null when no size comes out of the data
 * @param {object} totals        yearlyTotals(allDays)
 * @param {object} opts          { priceGiven: boolean, headingLevel: number }
 */
export function renderAnalysisResult(ind, totals, { priceGiven = false, headingLevel = 3 } = {}) {
  const h = `h${Math.min(6, headingLevel + 1)}`;
  if (!ind) {
    return `
<p class="spa-text">We bekeken ${periodText(totals)}: ongeveer <strong>${kwh(totals.injectie)}</strong> zonne-energie per jaar gaat naar het net en <strong>${kwh(totals.afname)}</strong> haal je ervan.</p>
<p class="spa-text">Daaruit komt geen duidelijke batterijgrootte naar voren, bijvoorbeeld omdat er weinig zonne-energie naar het net gaat. Een batterij kan wel zinvol zijn om je piek voor het capaciteitstarief te beperken, je elektrische wagen of warmtepomp slimmer te laten werken, goedkoop te laden met een dynamisch contract of je woning te voeden bij een stroomonderbreking. We bekijken graag samen wat bij jou past.</p>`;
  }
  const price = `${nl(ind.pricePerKwh, 2)} euro per kWh`;
  return `
<p class="spa-text">Op basis van ${periodText(totals)}.</p>
<ul class="spa-metrics">
  <li class="spa-metric">
    <span class="spa-metric-label">Zinvolle opslagcapaciteit</span>
    <span class="spa-metric-value">tot ± ${nl(ind.capacityKwh)} kWh</span>
    <span class="spa-metric-detail">Je zonne-overschot vult die op minstens 100 dagen per jaar volledig. Groter levert in jouw situatie weinig extra op.</span>
  </li>
  <li class="spa-metric">
    <span class="spa-metric-label">Zelf gebruikt per jaar</span>
    <span class="spa-metric-value">± ${kwh(ind.storedKwhPerYear)}</span>
    <span class="spa-metric-detail">Zonne-energie die je nu op het net zet en later terugkoopt.</span>
  </li>
  <li class="spa-metric">
    <span class="spa-metric-label">Besparing per jaar</span>
    <span class="spa-metric-value">tot ${eur(ind.savingUpToEur)}</span>
    <span class="spa-metric-detail">Op meer zelfverbruik, aan ${priceGiven ? `jouw prijs van ${price}` : price}.</span>
  </li>
</ul>
<${h} class="spa-subtitle">Goed om te weten</${h}>
<ul class="spa-notes">
  <li><strong>Enkel zelfverbruik.</strong> Met een dynamisch energiecontract of door je piek voor het capaciteitstarief te beperken, kan een batterij nog meer opleveren.</li>
  <li><strong>Een benadering.</strong> Verandert je verbruik, bijvoorbeeld door een elektrische wagen of een warmtepomp, dan verandert ook het resultaat, in beide richtingen.</li>
  <li><strong>Een richting voor de grootte.</strong> Je plannen of je eigen wensen kunnen een kleinere of grotere batterij verantwoorden. Wil je bewust groter gaan, dan houden we daar evengoed rekening mee. Ons advies is altijd open en transparant.</li>
  <li><strong>Zo rekenen we.</strong> Met de verliezen van de batterij, zonder de vergoeding die je nu eventueel voor injectie krijgt, en naar boven afgerond op 50 euro. Geen installatieprijs: die hangt af van je woning en je installatie.</li>
</ul>`;
}
