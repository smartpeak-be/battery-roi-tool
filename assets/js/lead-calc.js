// Lead-specific calculation logic: resolve defaults, select best config, build result.
// Pure functions — no DOM, no Firestore.

import { processDataPure } from './calc-engine.js';

// parseSheetConfigs will be used by lead.html directly, not by these helpers.
// Re-export it here for convenience.
export { parseSheetConfigs } from './calc-engine.js';

export const LEAD_DEFAULTS = {
  pvInverterKw: 3.5,
  pricePerKwh: 0.34,
  btw: 21
};

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

export function selectBestConfig(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw) {
  const priceKey = `${effectiveBtw}_yes`; // always keuring=yes
  let best = null;

  for (const cfg of configs) {
    const price = cfg.prices[priceKey];
    if (!price || price <= 0) continue;

    const selected = [{ ...cfg, price }];
    // Lead wizard always uses single tariff (priceDay = priceNight = pricePerKwh)
    const d = processDataPure({ allDays }, pvInverterKw, selected, pricePerKwh, pricePerKwh);
    if (!d || !d.configResults || !d.configResults.length) continue;

    const cr = d.configResults[0];
    const payback = cr.scenOpt.payback;
    if (!isFinite(payback)) continue;

    if (!best || payback < best.payback || (payback === best.payback && cfg.batCap < best.cfg.batCap)) {
      best = {
        cfg: { ...cfg, price },
        scenOpt: cr.scenOpt,
        payback,
        daysInWindow: d.daysInWindow,
        isFullYear: d.isFullYear
      };
    }
  }

  return best;
}

export function buildLeadResult(configResult) {
  const { cfg, scenOpt, daysInWindow, isFullYear } = configResult;
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
