// Chronological virtual-battery simulation.
//
// A block represents either one measured quarter-hour or an estimated day/night
// period. Energy is expressed in kWh, power in kW and duration in hours.

const MIN_MONTHLY_PEAK_KW = 2.5;

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date) {
  return dateKey(date).slice(0, 7);
}

function isWithin(date, start, end) {
  const key = dateKey(date);
  return (!start || key >= dateKey(start)) && (!end || key <= dateKey(end));
}

function tariffForBlock(block, priceDay, priceNight) {
  if (!Number.isFinite(priceNight) || priceNight <= 0) return priceDay;
  if (block.tariff === 'day') return priceDay;
  if (block.tariff === 'night') return priceNight;

  const d = block.start;
  const hour = d.getHours() + d.getMinutes() / 60;
  const weekday = d.getDay() >= 1 && d.getDay() <= 5;
  return weekday && hour >= 7 && hour < 22 ? priceDay : priceNight;
}

function chargeLimitKwh(block, cfg, pvInv, mode) {
  const exportKwh = clampNumber(block.injectie);
  const duration = Math.max(0.0001, clampNumber(block.durationHours, 0.25));
  const batteryLimit = clampNumber(cfg.batInv) * duration;

  // Quarter-hour measurements already reveal the actual average exported power.
  if (block.measuredInterval) return Math.min(exportKwh, batteryLimit);

  if (mode === 'worst' && pvInv > 0) {
    // With aggregated data, conservatively assume the export happened as fast as
    // the PV inverter permits. A weaker battery inverter then misses part of it.
    const shortestSourceDuration = Math.min(duration, exportKwh / pvInv);
    return Math.min(exportKwh, clampNumber(cfg.batInv) * shortestSourceDuration);
  }

  // Realistic aggregate scenario: production is spread over the known period.
  return Math.min(exportKwh, batteryLimit);
}

function emptyMetrics() {
  return {
    chargedInput: 0,
    delivered: 0,
    remainingAfname: 0,
    remainingInjectie: 0,
    originalAfname: 0,
    originalInjectie: 0,
    avoidedImportValue: 0,
    lostInjectionValue: 0,
    fullChargeEvents: 0,
    partialChargeEvents: 0,
  };
}

/**
 * Simulate one battery chronologically over the complete block stream.
 *
 * The state of charge starts before metricStart and carries across days. Metrics
 * are only accumulated inside metricStart..metricEnd, so a rolling-year result
 * still starts with the physically plausible charge left by earlier CSV data.
 */
export function simulateVirtualBattery(blocks, cfg, options = {}) {
  const mode = options.mode === 'worst' ? 'worst' : 'realistic';
  const pvInv = clampNumber(options.pvInv);
  const priceDay = clampNumber(options.priceDay);
  const priceNight = Number(options.priceNight);
  const injectionPrice = clampNumber(options.injectionPrice, 0.03);
  const capacityTariffRate = clampNumber(options.capacityTariffRate, 0);
  const annualizationFactor = Math.max(0.0001, clampNumber(options.annualizationFactor, 1));
  const metricStart = options.metricStart || null;
  const metricEnd = options.metricEnd || null;

  const capacity = clampNumber(cfg.batCap);
  const inverterPower = clampNumber(cfg.batInv);
  const efficiency = Math.min(1, Math.max(0.01, clampNumber(cfg.eff, 0.9)));
  let soc = 0; // usable output-energy remaining in the battery (kWh)
  const metrics = emptyMetrics();
  const peaks = new Map();

  const sorted = [...(blocks || [])].sort((a, b) => a.start - b.start);
  for (const block of sorted) {
    const duration = Math.max(0.0001, clampNumber(block.durationHours, 0.25));
    let afname = clampNumber(block.afname);
    let injectie = clampNumber(block.injectie);

    // Conservative handling of simultaneous import/export in the same interval:
    // only the net flow can be shifted. The realistic scenario allows both flows
    // to be handled inside the interval, which is the best plausible ordering.
    if (mode === 'worst' && block.measuredInterval) {
      const net = afname - injectie;
      afname = Math.max(0, net);
      injectie = Math.max(0, -net);
    }

    let chargedInput = 0;
    let delivered = 0;
    const powerEnergyLimit = inverterPower * duration;

    const doCharge = () => {
      if (injectie <= 0 || capacity <= 0 || inverterPower <= 0) return;
      const roomAsInput = Math.max(0, capacity - soc) / efficiency;
      chargedInput = Math.min(
        injectie,
        chargeLimitKwh({ ...block, injectie }, cfg, pvInv, mode),
        roomAsInput
      );
      soc = Math.min(capacity, soc + chargedInput * efficiency);
    };

    const doDischarge = () => {
      if (afname <= 0 || soc <= 0 || inverterPower <= 0) return;
      delivered = Math.min(afname, powerEnergyLimit, soc);
      soc = Math.max(0, soc - delivered);
    };

    // For aggregate blocks, worst case assumes consumption precedes production.
    // Realistic assumes available production can be stored before later demand.
    if (mode === 'worst') {
      doDischarge();
      doCharge();
    } else {
      doCharge();
      doDischarge();
    }

    if (!isWithin(block.start, metricStart, metricEnd)) continue;

    const remainingAfname = Math.max(0, afname - delivered);
    const remainingInjectie = Math.max(0, injectie - chargedInput);
    const tariff = tariffForBlock(block, priceDay, priceNight);

    metrics.chargedInput += chargedInput;
    metrics.delivered += delivered;
    metrics.remainingAfname += remainingAfname;
    metrics.remainingInjectie += remainingInjectie;
    metrics.originalAfname += afname;
    metrics.originalInjectie += injectie;
    metrics.avoidedImportValue += delivered * tariff;
    metrics.lostInjectionValue += chargedInput * injectionPrice;
    if (chargedInput > 0) {
      if (soc >= capacity - 1e-9) metrics.fullChargeEvents++;
      else metrics.partialChargeEvents++;
    }

    if (block.measuredInterval) {
      const key = monthKey(block.start);
      const row = peaks.get(key) || { month: key, originalKw: 0, simulatedKw: 0 };
      row.originalKw = Math.max(row.originalKw, clampNumber(block.afname) / duration);
      row.simulatedKw = Math.max(row.simulatedKw, remainingAfname / duration);
      peaks.set(key, row);
    }
  }

  const annualSaving = (metrics.avoidedImportValue - metrics.lostInjectionValue) * annualizationFactor;
  const installPrice = clampNumber(cfg.price);
  const peakMonths = [...peaks.values()].sort((a, b) => a.month.localeCompare(b.month));
  const capacityTariff = buildCapacityTariffResult(peakMonths, capacityTariffRate);

  return {
    ...metrics,
    endingSoc: soc,
    annualCharged: metrics.delivered * annualizationFactor,
    chargedFull: metrics.delivered,
    chargedPartial: 0,
    annualChargedFull: metrics.delivered * annualizationFactor,
    annualChargedPartial: 0,
    annualSavingFull: annualSaving,
    annualSavingPartial: 0,
    annualSaving,
    payback: installPrice > 0 && annualSaving > 0 ? installPrice / annualSaving : Infinity,
    qualifyingDays: metrics.fullChargeEvents,
    partialDays: metrics.partialChargeEvents,
    recoveryPctFull: metrics.originalAfname > 0 ? Math.min(100, metrics.delivered / metrics.originalAfname * 100) : 0,
    recoveryPctPartial: 0,
    injPctFull: metrics.originalInjectie > 0 ? Math.min(100, metrics.chargedInput / metrics.originalInjectie * 100) : 0,
    injPctPartial: 0,
    threshold: mode === 'worst' && pvInv > 0 ? capacity * Math.max(1, pvInv / Math.max(inverterPower, 0.001)) : capacity,
    cycles: capacity > 0 ? metrics.delivered / capacity : 0,
    capacityTariff,
  };
}

export function buildCapacityTariffResult(months, ratePerKwYear) {
  if (!months || months.length === 0) {
    return { available: false, months: [], originalAverageKw: 0, simulatedAverageKw: 0, annualSaving: 0 };
  }
  // A 365-day rolling window can touch 13 calendar months. Capacity billing is
  // based on monthly peaks, so use at most the 12 most recent months.
  const selectedMonths = [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const withBillable = selectedMonths.map(row => ({
    ...row,
    originalBillableKw: Math.max(MIN_MONTHLY_PEAK_KW, row.originalKw),
    simulatedBillableKw: Math.max(MIN_MONTHLY_PEAK_KW, row.simulatedKw),
  }));
  const avg = key => withBillable.reduce((sum, row) => sum + row[key], 0) / withBillable.length;
  const originalAverageKw = avg('originalBillableKw');
  const simulatedAverageKw = avg('simulatedBillableKw');
  return {
    available: true,
    months: withBillable,
    originalAverageKw,
    simulatedAverageKw,
    annualSaving: Math.max(0, originalAverageKw - simulatedAverageKw) * ratePerKwYear,
    ratePerKwYear,
    minimumKw: MIN_MONTHLY_PEAK_KW,
  };
}

export function buildAggregateBlocks(allDays) {
  const blocks = [];
  for (const day of allDays || []) {
    const hasSplit = (day.afnamedag || day.afnamenacht || day.injectiedag || day.injectienacht) > 0;
    if (!hasSplit) {
      blocks.push({
        start: new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 0, 0),
        durationHours: 24,
        afname: day.afname || 0,
        injectie: day.injectie || 0,
        tariff: 'single',
        measuredInterval: false,
      });
      continue;
    }

    const weekday = day.date.getDay() >= 1 && day.date.getDay() <= 5;
    // Night first, then day. Night totals combine the hours before 07:00 and
    // after 22:00, so this remains an approximation and is shown as a range.
    blocks.push({
      start: new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 0, 0),
      durationHours: weekday ? 9 : 24,
      afname: day.afnamenacht || 0,
      injectie: day.injectienacht || 0,
      tariff: 'night',
      measuredInterval: false,
    });
    if (weekday) {
      blocks.push({
        start: new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 7, 0),
        durationHours: 15,
        afname: day.afnamedag || 0,
        injectie: day.injectiedag || 0,
        tariff: 'day',
        measuredInterval: false,
      });
    }
  }
  return blocks;
}
