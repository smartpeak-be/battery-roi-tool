import { fmt2, fmtEur } from '../calc-engine.js';
import { escapeHtml } from '../shared-helpers.js';

/** Build HTML for a single scenario card (Worst Case or Realistisch). */
export function makeScenCard(d, title, badge, badgeClass, cssClass, scen, cfg, extraInfo, mainColorOverride, scenAvg) {
  const fkw  = n => fmt2(n) + ' kWh';
  const feur = n => fmtEur(n) + ' / jaar';

  const paybackText = !isFinite(scen.payback) || scen.payback <= 0 ? '—'
    : scen.payback > 100 ? '> 100 jaar' : `${fmt2(scen.payback)} jaar`;
  const mainColor = mainColorOverride || (cssClass === 'optimal' ? 'green' : 'blue');
  const pctFull    = Math.min(scen.recoveryPctFull,    100);
  const pctPartial = Math.min(scen.recoveryPctPartial, 100 - pctFull);
  const injFull    = Math.min(scen.injPctFull,    100);
  const injPartial = Math.min(scen.injPctPartial, 100 - injFull);
  const priceLine  = `<div style="font-size:0.8rem;color:var(--primary);margin-top:4px;">💱 Afname: <strong>${fmtEur(d.effectivePrice)}/kWh</strong> &nbsp;·&nbsp; injectie: <strong>${fmtEur(d.injectionPrice || 0)}/kWh</strong></div>`;
  const barColor     = `var(--${mainColor === 'green' ? 'success' : mainColor === 'orange' ? 'warning' : 'primary'})`;
  // Partial color: clearly distinct from full color per scenario type
  // orange (worst-case) → red  |  blue (optimistic) → amber  |  green (optimal) → teal
  const partialColor = mainColor === 'orange' ? 'var(--danger)'
                     : mainColor === 'green'  ? '#00897b'
                     : 'rgba(246,166,35,0.85)';
  const N = d.numYears;
  const showAvg = N >= 2 && scenAvg;
  function avgPaybackText(p) {
    if (!isFinite(p) || p <= 0) return '—';
    return p > 100 ? '> 100 jaar' : `${fmt2(p)} jaar`;
  }
  const avgPaybackLine = showAvg
    ? `<div class="muted-inline" style="display:block;margin-left:0;margin-top:2px;">gem. ${N} j: ${avgPaybackText(scenAvg.payback)}</div>`
    : '';
  const avgSavingLine = showAvg
    ? `<div class="muted-inline" style="display:block;margin-left:0;margin-top:2px;">gem. ${N} j: ${feur(scenAvg.annualSaving)}</div>`
    : '';
  const totalCharged = scen.chargedFull + scen.chargedPartial;
  const avgTotalCharged = showAvg ? scenAvg.chargedFull + scenAvg.chargedPartial : null;
  const avgChargedLine = showAvg
    ? `<div class="muted-inline" style="display:block;margin-left:0;margin-top:2px;">gem. ${N} j: ${fkw(avgTotalCharged)}</div>`
    : '';
  const priceDisclaimer = '<div style="font-size:0.7rem;line-height:1.35;color:var(--muted);margin-top:4px;">Prijzen zijn indicatief en kunnen wijzigen door prijsaanpassingen van leveranciers. De definitieve prijs wordt vastgelegd in de offerte.</div>';
  return `<div class="scenario-card ${cssClass}">
    <span class="badge ${badgeClass}">${badge}</span>
    <h3>${title}</h3>
    <div class="scenario-sub">${extraInfo}${priceLine}</div>
    <div class="stat-row"><span class="stat-label">Totale opgeslagen energie</span><span class="stat-value green big" style="display:flex;flex-direction:column;align-items:flex-end;">${fkw(totalCharged)}${avgChargedLine}</span></div>
    <div class="stat-row"><span class="stat-label">Totale jaarlijkse besparing</span><span class="stat-value green big" style="display:flex;flex-direction:column;align-items:flex-end;">${feur(scen.annualSaving)}${avgSavingLine}</span></div>
    ${(() => {
  const installPrice = cfg.price;
  const lines = Array.isArray(cfg.compositionLines) && cfg.compositionLines.length
    ? cfg.compositionLines
    : (Array.isArray(cfg.meerkostLines) ? cfg.meerkostLines : []);
  if (lines.length === 0) {
    return `<div class="stat-row"><span class="stat-label">Installatieprijs</span><span class="stat-value">${fmtEur(installPrice)}</span></div>${priceDisclaimer}`;
  }
  const lineRows = lines.map((ln, i) => {
    const label = (ln.description && ln.description.trim() !== '') ? escapeHtml(ln.description) : `Lijn #${i+1}`;
    const amount = ln.amountInclBtw != null ? ln.amountInclBtw : ln.amountExBtw;
    return `<div class="breakdown-row"><span>${label}</span><span>${fmtEur(amount)}</span></div>`;
  }).join('');
  return `
    <details class="installprice-details">
      <summary><span class="stat-label">Installatieprijs</span><span class="stat-value">${fmtEur(installPrice)}</span></summary>
      <div class="breakdown-row"><span>Basis configuratie</span><span>${fmtEur(cfg.basePrice)}</span></div>
      ${lineRows}
      <div class="breakdown-row totaal"><span>Totaal installatie</span><span>${fmtEur(installPrice)}</span></div>
    </details>
    ${priceDisclaimer}
  `;
})()}
    <div class="stat-row"><span class="stat-label">Terugverdientijd</span><span class="stat-value big" style="color:var(--warning);display:flex;flex-direction:column;align-items:flex-end;">${paybackText}${avgPaybackLine}</span></div>
    <details class="scen-details">
      <summary>Details <span class="chev">▾</span></summary>
      <div class="stat-row"><span class="stat-label">Uit injectie opgenomen</span><span class="stat-value">${fkw(scen.chargedInput || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Door batterij aan woning geleverd</span><span class="stat-value green">${fkw(scen.delivered || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Resterende netafname</span><span class="stat-value">${fkw(scen.remainingAfname || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Resterende netinjectie</span><span class="stat-value">${fkw(scen.remainingInjectie || 0)}</span></div>
      <div class="stat-row"><span class="stat-label">Waarde vermeden afname</span><span class="stat-value green">${fmtEur(scen.avoidedImportValue || 0)} / jaar</span></div>
      <div class="stat-row"><span class="stat-label">Misgelopen injectievergoeding</span><span class="stat-value" style="color:var(--warning)">− ${fmtEur(scen.lostInjectionValue || 0)} / jaar</span></div>
      <div class="stat-row"><span class="stat-label">Equivalent aantal cycli</span><span class="stat-value">${fmt2(scen.cycles || 0)}</span></div>
    </details>
    ${scen.capacityTariff && scen.capacityTariff.available ? `
    <details class="scen-details">
      <summary>Capaciteitstarief (apart) <span class="chev">▾</span></summary>
      <div class="stat-row"><span class="stat-label">Gem. maandpiek zonder batterij</span><span class="stat-value">${fmt2(scen.capacityTariff.originalAverageKw)} kW</span></div>
      <div class="stat-row"><span class="stat-label">Gem. maandpiek met batterij</span><span class="stat-value">${fmt2(scen.capacityTariff.simulatedAverageKw)} kW</span></div>
      <div class="stat-row"><span class="stat-label">Mogelijke extra besparing</span><span class="stat-value green">${fmtEur(scen.capacityTariff.annualSaving)} / jaar</span></div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:6px;">Indicatief, minimum 2,5 kW per maand toegepast. Niet opgenomen in de terugverdientijd hierboven.</div>
    </details>` : ''}
    ${(() => {
      const avgRecPct = showAvg ? Math.min(100, scenAvg.recoveryPctFull + scenAvg.recoveryPctPartial) : null;
      const avgInjPct = showAvg ? Math.min(100, scenAvg.injPctFull      + scenAvg.injPctPartial)      : null;
      const recMarker = avgRecPct == null ? '' : `<div class="bar-marker" style="left:${avgRecPct}%" title="gem. ${N} j: ${fmt2(avgRecPct)}%"></div>`;
      const injMarker = avgInjPct == null ? '' : `<div class="bar-marker" style="left:${avgInjPct}%" title="gem. ${N} j: ${fmt2(avgInjPct)}%"></div>`;
      const recAvgLegend = avgRecPct == null ? '' : `<span class="muted-inline" style="margin-left:0;">▼ gem. ${N} j: ${fmt2(avgRecPct)}%</span>`;
      const injAvgLegend = avgInjPct == null ? '' : `<span class="muted-inline" style="margin-left:0;">▼ gem. ${N} j: ${fmt2(avgInjPct)}%</span>`;
      return `
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
      <div>
        <div style="font-size:0.8rem;color:var(--muted);margin-bottom:5px;">Recuperatie t.o.v. <strong>afname</strong></div>
        <div class="bar-container">
          <div class="bar-with-marker">
            <div class="bar-bg" style="height:14px;position:relative;background:var(--border);border-radius:5px;overflow:hidden;">
              <div style="width:${pctFull+pctPartial}%;position:absolute;top:0;height:100%;background:${barColor};border-radius:5px;"></div>
              <div style="width:${pctPartial}%;position:absolute;top:0;height:100%;left:${pctFull}%;background:${partialColor};border-radius:0 5px 5px 0;"></div>
            </div>
            ${recMarker}
          </div>
          <span style="font-size:0.82rem;font-weight:600;min-width:56px;text-align:right">${fmt2(pctFull+pctPartial)}%</span>
        </div>
        <div class="bar-legend">
          <span><span class="dot" style="background:${barColor}"></span>Volledig: ${fmt2(pctFull)}%</span>
          <span><span class="dot" style="background:${partialColor}"></span>Partieel: ${fmt2(pctPartial)}%</span>
          ${recAvgLegend}
        </div>
      </div>
      <div>
        <div style="font-size:0.8rem;color:var(--muted);margin-bottom:5px;">Recuperatie t.o.v. <strong>injectie</strong></div>
        <div class="bar-container">
          <div class="bar-with-marker">
            <div class="bar-bg" style="height:14px;position:relative;background:var(--border);border-radius:5px;overflow:hidden;">
              <div style="width:${injFull+injPartial}%;position:absolute;top:0;height:100%;background:${barColor};border-radius:5px;"></div>
              <div style="width:${injPartial}%;position:absolute;top:0;height:100%;left:${injFull}%;background:${partialColor};border-radius:0 5px 5px 0;"></div>
            </div>
            ${injMarker}
          </div>
          <span style="font-size:0.82rem;font-weight:600;min-width:56px;text-align:right">${fmt2(injFull+injPartial)}%</span>
        </div>
        <div class="bar-legend">
          <span><span class="dot" style="background:${barColor}"></span>Volledig: ${fmt2(injFull)}%</span>
          <span><span class="dot" style="background:${partialColor}"></span>Partieel: ${fmt2(injPartial)}%</span>
          ${injAvgLegend}
        </div>
      </div>
    </div>`;
    })()}
  </div>`;
}

