import { describe, it, expect } from 'vitest';
import {
  resolveLeadInputs,
  selectBestConfig,
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

// ─── selectBestConfig ───────────────────────────────────────────────────

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
      makeConfig('Big-20', 20, 5, 0.95, 12000),
      makeConfig('Small-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // The smaller, cheaper config should have shorter payback
    expect(result.cfg.type).toBe('Small-5');
  });

  it('tiebreaks on lower capacity when payback is equal', () => {
    const days = makeDays();
    // Two configs with same price/capacity ratio — payback should be similar
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
      makeConfig('B-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // Smaller config wins (either via shorter payback or tiebreak)
    expect(result.cfg.type).toBe('B-5');
  });

  it('returns null when all configs give Infinity payback', () => {
    // 0 injection = no solar surplus = Infinity payback
    const days = makeDays(365, 10, 0);
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).toBeNull();
  });

  it('uses correct price key for 6% BTW', () => {
    const days = makeDays();
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
    ];
    const result6 = selectBestConfig(days, configs, 3.5, 0.34, 6);
    const result21 = selectBestConfig(days, configs, 3.5, 0.34, 21);
    // 6% price is lower (0.85x) so payback should be shorter
    expect(result6).not.toBeNull();
    expect(result21).not.toBeNull();
    expect(result6.payback).toBeLessThan(result21.payback);
  });
});

// ─── buildLeadResult ────────────────────────────────────────────────────

describe('buildLeadResult', () => {
  it('extracts all required fields from configResult', () => {
    const configResult = {
      cfg: { type: 'Test-10', batCap: 10, batInv: 5, eff: 0.95, price: 6000 },
      scenOpt: {
        payback: 6.2,
        recoveryPctFull: 78.5,
        recoveryPctPartial: 94.2,
        qualifyingDays: 187,
        partialDays: 312,
        annualSaving: 485.20,
        annualCharged: 2800
      },
      daysInWindow: 365,
      isFullYear: true
    };
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
