import { describe, it, expect } from 'vitest';
import {
  resolveLeadInputs,
  selectBestConfig,
  selectBestConfigs,
  buildLeadResult,
  buildDefaultsNotes
} from '../assets/js/lead-calc.js';

// ─── resolveLeadInputs ─────────────────────────────────────────────────

describe('resolveLeadInputs', () => {
  it('uses all defaults when nothing provided', () => {
    const result = resolveLeadInputs({});
    expect(result.pvInverterKw).toBe(3.5);
    expect(result.pricePerKwh).toBe(0.34);
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.pvInverterKw).toBe(true);
    expect(result.defaultsUsed.pricePerKwh).toBe(true);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(true);
  });

  it('uses provided values when given', () => {
    const result = resolveLeadInputs({
      pvInverterKw: 5.0,
      pricePerKwh: 0.28,
      houseAgeOver10Years: true
    });
    expect(result.pvInverterKw).toBe(5.0);
    expect(result.pricePerKwh).toBe(0.28);
    expect(result.effectiveBtw).toBe(6);
    expect(result.defaultsUsed.pvInverterKw).toBe(false);
    expect(result.defaultsUsed.pricePerKwh).toBe(false);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(false);
  });

  it('houseAgeOver10Years false means 21% BTW', () => {
    const result = resolveLeadInputs({ houseAgeOver10Years: false });
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(false);
  });

  it('houseAgeOver10Years null means 21% BTW and default flagged', () => {
    const result = resolveLeadInputs({ houseAgeOver10Years: null });
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(true);
  });

  it('ignores zero values (treated as not provided)', () => {
    const result = resolveLeadInputs({ pvInverterKw: 0, pricePerKwh: 0 });
    expect(result.pvInverterKw).toBe(3.5);
    expect(result.pricePerKwh).toBe(0.34);
    expect(result.defaultsUsed.pvInverterKw).toBe(true);
    expect(result.defaultsUsed.pricePerKwh).toBe(true);
  });
});

// ─── selectBestConfig (legacy, delegates to selectBestConfigs) ──────────

describe('selectBestConfig', () => {
  // Helper: create a minimal allDays array (365 days of synthetic data)
  function makeDays(n = 365, afname = 10, injectie = 15) {
    const start = new Date(2025, 0, 1);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        afname, injectie,
        afnamedag: afname / 2, afnamenacht: afname / 2,
        injectiedag: injectie / 2, injectienacht: injectie / 2
      };
    });
  }

  // Helper: create a minimal config
  function makeConfig(type, batCap, batInv, eff, price) {
    return { type, omschrijving: type, batCap, batInv, eff, prices: { '21_yes': price, '6_yes': price * 0.85 } };
  }

  it('returns config with shortest payback', () => {
    const days = makeDays();
    const configs = [
      makeConfig('ZSF-Big-20', 20, 5, 0.95, 12000),
      makeConfig('ZSF-Small-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // The smaller, cheaper config should have shorter payback
    expect(result.cfg.type).toBe('ZSF-Small-5');
  });

  it('tiebreaks on lower capacity when payback is equal', () => {
    const days = makeDays();
    // Two configs with same price/capacity ratio — payback should be similar
    const configs = [
      makeConfig('ZSF-A-10', 10, 5, 0.95, 6000),
      makeConfig('ZSF-B-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // Smaller config wins (either via shorter payback or tiebreak)
    expect(result.cfg.type).toBe('ZSF-B-5');
  });

  it('returns null when all configs give Infinity payback', () => {
    // 0 injection = no solar surplus = Infinity payback
    const days = makeDays(365, 10, 0);
    const configs = [
      makeConfig('ZSF-A-10', 10, 5, 0.95, 6000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).toBeNull();
  });

  it('uses correct price key for 6% BTW', () => {
    const days = makeDays();
    const configs = [
      makeConfig('ZSF-A-10', 10, 5, 0.95, 6000),
    ];
    const result6 = selectBestConfig(days, configs, 3.5, 0.34, 6);
    const result21 = selectBestConfig(days, configs, 3.5, 0.34, 21);
    // 6% price is lower (0.85x) so payback should be shorter
    expect(result6).not.toBeNull();
    expect(result21).not.toBeNull();
    expect(result6.payback).toBeLessThan(result21.payback);
  });
});

// ─── selectBestConfigs (new: top N, Zendure-only) ──────────────────────

describe('selectBestConfigs', () => {
  function makeDays(n = 365, afname = 10, injectie = 15) {
    const start = new Date(2025, 0, 1);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        afname, injectie,
        afnamedag: afname / 2, afnamenacht: afname / 2,
        injectiedag: injectie / 2, injectienacht: injectie / 2
      };
    });
  }

  function makeConfig(type, batCap, batInv, eff, price) {
    return { type, omschrijving: type, batCap, batInv, eff, prices: { '21_yes': price, '6_yes': price * 0.85 } };
  }

  it('filters out Marstek configs (MARVE prefix)', () => {
    const days = makeDays();
    const configs = [
      makeConfig('MARVE-5', 5, 2.5, 0.95, 2000),    // cheapest, but Marstek
      makeConfig('ZSF-10', 10, 5, 0.95, 6000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21);
    expect(results.length).toBe(1);
    expect(results[0].cfg.type).toBe('ZSF-10');
  });

  it('filters out non-ZSF configs (only ZSF prefix passes)', () => {
    const days = makeDays();
    const configs = [
      makeConfig('OtherBrand-5', 5, 2.5, 0.95, 2000),
      makeConfig('ZSF-5', 5, 2.5, 0.95, 3000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21);
    expect(results.length).toBe(1);
    expect(results[0].cfg.type).toBe('ZSF-5');
  });

  it('returns top 2 by default, sorted by payback ascending', () => {
    const days = makeDays();
    const configs = [
      makeConfig('ZSF-20', 20, 5, 0.95, 12000),
      makeConfig('ZSF-5', 5, 2.5, 0.95, 3000),
      makeConfig('ZSF-10', 10, 3.5, 0.95, 5000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21);
    expect(results.length).toBe(2);
    // First result should have shortest payback
    expect(results[0].payback).toBeLessThanOrEqual(results[1].payback);
  });

  it('returns fewer than topN when not enough viable configs', () => {
    const days = makeDays();
    const configs = [
      makeConfig('ZSF-5', 5, 2.5, 0.95, 3000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21, 2);
    expect(results.length).toBe(1);
  });

  it('returns empty array when no ZSF configs have finite payback', () => {
    const days = makeDays(365, 10, 0); // no injection
    const configs = [
      makeConfig('ZSF-10', 10, 5, 0.95, 6000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21);
    expect(results).toEqual([]);
  });

  it('respects topN parameter', () => {
    const days = makeDays();
    const configs = [
      makeConfig('ZSF-5', 5, 2.5, 0.95, 3000),
      makeConfig('ZSF-10', 10, 3.5, 0.95, 5000),
      makeConfig('ZSF-20', 20, 5, 0.95, 12000),
    ];
    const results = selectBestConfigs(days, configs, 3.5, 0.34, 21, 1);
    expect(results.length).toBe(1);
  });
});

// ─── buildLeadResult ────────────────────────────────────────────────────

describe('buildLeadResult', () => {
  const makeConfigResult = (type, batCap, batInv, payback, annualSaving) => ({
    cfg: { type, batCap, batInv, eff: 0.95, price: 6000 },
    scenOpt: {
      payback,
      recoveryPctFull: 78.5,
      recoveryPctPartial: 94.2,
      qualifyingDays: 187,
      partialDays: 312,
      annualSaving,
      annualCharged: 2800
    },
    daysInWindow: 365,
    isFullYear: true
  });

  it('extracts all required fields from single configResult (backward compat)', () => {
    const configResult = makeConfigResult('Test-10', 10, 5, 6.2, 485.20);
    const result = buildLeadResult(configResult);
    expect(result.bestConfigType).toBe('Test-10');
    expect(result.batteryCapKwh).toBe(10);
    expect(result.batteryInverterKw).toBe(5);
    expect(result.roiYears).toBe(6.2);
    expect(result.recoveryPctFull).toBe(78.5);
    expect(result.recoveryPctPartial).toBe(94.2);
    expect(result.qualifyingDays).toBe(187);
    expect(result.partialDays).toBe(312);
    expect(result.annualSavingEur).toBe(485.20);
    expect(result.daysInWindow).toBe(365);
    expect(result.isFullYear).toBe(true);
    expect(result.isRange).toBeUndefined();
  });

  it('produces range result from array of 2 configResults', () => {
    const arr = [
      makeConfigResult('ZSF-5', 5, 2.5, 5.0, 600),
      makeConfigResult('ZSF-20', 20, 5, 7.0, 850),
    ];
    const result = buildLeadResult(arr);
    expect(result.isRange).toBe(true);
    expect(result.configTypes).toEqual(['ZSF-5', 'ZSF-20']);
    expect(result.batteryCapKwh).toEqual({ min: 5, max: 20 });
    expect(result.batteryInverterKw).toEqual({ min: 2.5, max: 5 });
    expect(result.roiYears).toEqual({ min: 5.0, max: 7.0 });
    expect(result.annualSavingEur).toEqual({ min: 600, max: 850 });
    expect(result.daysInWindow).toBe(365);
    expect(result.isFullYear).toBe(true);
  });

  it('produces flat (non-range) result from single-element array', () => {
    const arr = [makeConfigResult('ZSF-10', 10, 5, 6.2, 485.20)];
    const result = buildLeadResult(arr);
    expect(result.bestConfigType).toBe('ZSF-10');
    expect(result.isRange).toBeUndefined();
    expect(typeof result.batteryCapKwh).toBe('number');
  });

  it('returns null from empty array', () => {
    expect(buildLeadResult([])).toBeNull();
  });
});

// ─── buildDefaultsNotes ─────────────────────────────────────────────────

describe('buildDefaultsNotes', () => {
  it('returns empty string when no defaults used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: false,
      pricePerKwh: false,
      houseAgeOver10Years: false
    });
    expect(notes).toBe('');
  });

  it('lists all defaults when all used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: true,
      pricePerKwh: true,
      houseAgeOver10Years: true
    });
    expect(notes).toContain('Standaardwaarden gebruikt:');
    expect(notes).toContain('3,5 kW');
    expect(notes).toContain('0,34 EUR/kWh');
    expect(notes).toContain('21%');
  });

  it('lists only the defaults that were used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: true,
      pricePerKwh: false,
      houseAgeOver10Years: false
    });
    expect(notes).toContain('3,5 kW');
    expect(notes).not.toContain('0,34');
    expect(notes).not.toContain('21%');
  });
});
