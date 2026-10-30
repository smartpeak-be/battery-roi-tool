// Lead-specific calculation logic: resolve defaults, select best config, build result.
// Pure functions — no DOM, no Firestore.

import { processDataPure, calcScenario } from './calc-engine.js';

// parseSheetConfigs will be used by lead.html directly, not by these helpers.
// Re-export it here for convenience.
export { parseSheetConfigs } from './calc-engine.js';

export const LEAD_DEFAULTS = {
  pvInverterKw: 3.5,
  pricePerKwh: 0.39,
  btw: 21
};

// Customer-facing indication (website analysis and lead-result.html). No product, no price of an
// installation and no payback time: only what the customer's own data says about a battery.
export const PUBLIC_INDICATION = {
  efficiency: 0.9,      // round trip of a lithium (LFP) home battery
  roundSavingTo: 50     // "savings up to" is rounded up to the next 50 euro
};

/**
 * What a battery would do with this customer's surplus, for the public result page.
 * Size: the largest capacity that the daily solar surplus fills completely on at least
 * 100 days a year (the capacity analysis of the calculator). Saving: the energy the
 * battery delivers per year (self-consumption only), valued at the full price per kWh
 * and rounded up to 50 euro, so it is shown as "up to". Dynamic tariffs, the capacity
 * tariff and the injection fee are deliberately left out.
 * @returns {null | { capacityKwh, fullDays, storedKwhPerYear, savingUpToEur, pricePerKwh, efficiency, daysInWindow, isFullYear }}
 */
export function buildPublicIndication(allDays, pricePerKwh) {
  if (!Array.isArray(allDays) || !allDays.length || !(pricePerKwh > 0)) return null;
  const d = processDataPure({ allDays }, 0, [], pricePerKwh, null);
  const capacityKwh = d && d.capAnalysis && d.capAnalysis.maxCap;
  if (!capacityKwh) return null;
  const { efficiency, roundSavingTo } = PUBLIC_INDICATION;
  const scen = calcScenario(d.windowDays, {
    threshold: capacityKwh,
    installPrice: 0,
    batCap: capacityKwh,
    eff: efficiency,
    scaleFactor: d.isFullYear ? 1 : 365 / d.daysInWindow,
    effectivePrice: pricePerKwh,
    totalAfname: d.totalAfname,
    totalInjectie: d.totalInjectie
  });
  if (!(scen.annualCharged > 0)) return null;
  return {
    capacityKwh,
    fullDays: d.capAnalysis.rows.find(r => r.cap === capacityKwh)?.qualDays ?? null,
    storedKwhPerYear: Math.round(scen.annualCharged),
    savingUpToEur: Math.ceil(scen.annualSaving / roundSavingTo) * roundSavingTo,
    pricePerKwh,
    efficiency,
    daysInWindow: d.daysInWindow,
    isFullYear: d.isFullYear
  };
}

export function resolveLeadInputs(raw) {
  const pvGiven    = typeof raw.pvInverterKw === 'number' && raw.pvInverterKw > 0;
  const priceGiven = typeof raw.pricePerKwh === 'number' && raw.pricePerKwh > 0;
  const houseGiven = raw.houseAgeOver10Years === true || raw.houseAgeOver10Years === false;

  return {
    pvInverterKw: pvGiven ? raw.pvInverterKw : LEAD_DEFAULTS.pvInverterKw,
    pricePerKwh:  priceGiven ? raw.pricePerKwh : LEAD_DEFAULTS.pricePerKwh,
    effectiveBtw: (raw.houseAgeOver10Years === true) ? 6 : LEAD_DEFAULTS.btw,
    defaultsUsed: {
      pvInverterKw:      !pvGiven,
      pricePerKwh:       !priceGiven,
      houseAgeOver10Years: !houseGiven
    }
  };
}

/**
 * @deprecated Use selectBestConfigs (plural) instead.
 * Kept for backward compatibility.
 */
export function selectBestConfig(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw) {
  const top = selectBestConfigs(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw, 1);
  return top.length ? top[0] : null;
}

/**
 * Select the top N configs by best ROI (shortest payback).
 * Filters out Marstek configs — only Zendure products are considered for leads.
 * @param {number} topN - how many configs to return (default 2)
 * @returns {Array} sorted by payback ascending, length 0..topN
 */
export function selectBestConfigs(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw, topN = 2) {
  const priceKey = `${effectiveBtw}_yes`; // always keuring=yes

  // Filter: only Zendure configs (type prefix "ZSF").
  // Marstek configs (prefix "MARVE") and any other brands are excluded.
  const zendureConfigs = configs.filter(c =>
    typeof c.type === 'string' && c.type.startsWith('ZSF')
  );

  const scored = [];

  for (const cfg of zendureConfigs) {
    const price = cfg.prices[priceKey];
    if (!price || price <= 0) continue;

    const selected = [{ ...cfg, price }];
    // Lead wizard always uses single tariff (priceDay = priceNight = pricePerKwh)
    const d = processDataPure({ allDays }, pvInverterKw, selected, pricePerKwh, pricePerKwh);
    if (!d || !d.configResults || !d.configResults.length) continue;

    const cr = d.configResults[0];
    const payback = cr.scenOpt.payback;
    if (!isFinite(payback)) continue;

    scored.push({
      cfg: { ...cfg, price },
      scenOpt: cr.scenOpt,
      payback,
      daysInWindow: d.daysInWindow,
      isFullYear: d.isFullYear
    });
  }

  // Sort by payback ascending; tiebreak on lower capacity
  scored.sort((a, b) => a.payback - b.payback || a.cfg.batCap - b.cfg.batCap);

  return scored.slice(0, topN);
}

/**
 * Build a lead result from one or more config results.
 * When given an array, produces min/max ranges for all numeric fields.
 * When given a single object, produces the legacy flat shape (backward compat).
 * @param {Object|Array} configResultOrArray - single configResult or array of them
 */
export function buildLeadResult(configResultOrArray) {
  const arr = Array.isArray(configResultOrArray) ? configResultOrArray : [configResultOrArray];
  if (arr.length === 0) return null;

  // Single config — flat shape (backward compat with existing leads)
  if (arr.length === 1) {
    const { cfg, scenOpt, daysInWindow, isFullYear } = arr[0];
    return {
      bestConfigType:     cfg.type,
      batteryCapKwh:      cfg.batCap,
      batteryInverterKw:  cfg.batInv,
      roiYears:           scenOpt.payback,
      recoveryPctFull:    scenOpt.recoveryPctFull,
      recoveryPctPartial: scenOpt.recoveryPctPartial,
      qualifyingDays:     scenOpt.qualifyingDays,
      partialDays:        scenOpt.partialDays,
      annualSavingEur:    scenOpt.annualSaving,
      daysInWindow,
      isFullYear
    };
  }

  // Multiple configs — produce ranges
  const configs = arr.map(({ cfg, scenOpt, daysInWindow, isFullYear }) => ({
    configType:        cfg.type,
    batteryCapKwh:     cfg.batCap,
    batteryInverterKw: cfg.batInv,
    roiYears:          scenOpt.payback,
    recoveryPctFull:   scenOpt.recoveryPctFull,
    recoveryPctPartial:scenOpt.recoveryPctPartial,
    qualifyingDays:    scenOpt.qualifyingDays,
    partialDays:       scenOpt.partialDays,
    annualSavingEur:   scenOpt.annualSaving,
    daysInWindow,
    isFullYear
  }));

  const min = (key) => Math.min(...configs.map(c => c[key]));
  const max = (key) => Math.max(...configs.map(c => c[key]));

  return {
    // Flag indicating this is a range result
    isRange: true,
    configTypes:        configs.map(c => c.configType),
    // Flat min/max fields for easy rendering
    batteryCapKwh:      { min: min('batteryCapKwh'),      max: max('batteryCapKwh') },
    batteryInverterKw:  { min: min('batteryInverterKw'),  max: max('batteryInverterKw') },
    roiYears:           { min: min('roiYears'),           max: max('roiYears') },
    recoveryPctFull:    { min: min('recoveryPctFull'),    max: max('recoveryPctFull') },
    recoveryPctPartial: { min: min('recoveryPctPartial'), max: max('recoveryPctPartial') },
    annualSavingEur:    { min: min('annualSavingEur'),    max: max('annualSavingEur') },
    qualifyingDays:     { min: min('qualifyingDays'),     max: max('qualifyingDays') },
    partialDays:        { min: min('partialDays'),        max: max('partialDays') },
    daysInWindow:       configs[0].daysInWindow,
    isFullYear:         configs[0].isFullYear,
    // Keep individual configs for reference
    configs
  };
}

export function buildDefaultsNotes(defaultsUsed) {
  const lines = [];
  if (defaultsUsed.pvInverterKw) {
    lines.push(`- Omvormervermogen: ${String(LEAD_DEFAULTS.pvInverterKw).replace('.', ',')} kW (niet opgegeven)`);
  }
  if (defaultsUsed.pricePerKwh) {
    lines.push(`- Energiekost: ${String(LEAD_DEFAULTS.pricePerKwh).replace('.', ',')} EUR/kWh (niet opgegeven)`);
  }
  if (defaultsUsed.houseAgeOver10Years) {
    lines.push(`- BTW: ${LEAD_DEFAULTS.btw}% (woningtype niet opgegeven)`);
  }
  return lines.length ? `Standaardwaarden gebruikt:\n${lines.join('\n')}` : '';
}
