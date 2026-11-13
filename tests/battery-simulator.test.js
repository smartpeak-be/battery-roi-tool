import { describe, expect, it } from 'vitest';
import {
  buildCapacityTariffResult,
  simulateVirtualBattery,
} from '../assets/js/battery-simulator.js';

const CFG = { batCap: 8, batInv: 2.5, eff: 0.9, price: 3600 };

function block(iso, { afname = 0, injectie = 0, hours = 0.25, measured = true } = {}) {
  return {
    start: new Date(iso),
    durationHours: hours,
    afname,
    injectie,
    tariff: 'single',
    measuredInterval: measured,
  };
}

describe('simulateVirtualBattery', () => {
  it('carries state of charge chronologically into the next interval and day', () => {
    const blocks = [
      block('2026-06-01T12:00:00', { injectie: 1 }),
      block('2026-06-02T07:00:00', { afname: 0.5 }),
    ];
    const result = simulateVirtualBattery(blocks, CFG, {
      mode: 'realistic', pvInv: 5, priceDay: 0.32, injectionPrice: 0.03,
    });
    // 2.5 kW × 0.25 h = 0.625 kWh can enter; 90% becomes usable SOC.
    expect(result.chargedInput).toBeCloseTo(0.625, 6);
    expect(result.delivered).toBeCloseTo(0.5, 6);
    expect(result.endingSoc).toBeCloseTo(0.0625, 6);
  });

  it('subtracts lost injection compensation from avoided import value', () => {
    const blocks = [
      block('2026-06-01T12:00:00', { injectie: 0.5 }),
      block('2026-06-01T18:00:00', { afname: 0.45 }),
    ];
    const result = simulateVirtualBattery(blocks, CFG, {
      mode: 'realistic', pvInv: 5, priceDay: 0.40, injectionPrice: 0.03,
    });
    expect(result.avoidedImportValue).toBeCloseTo(0.18, 6);
    expect(result.lostInjectionValue).toBeCloseTo(0.015, 6);
    expect(result.annualSaving).toBeCloseTo(0.165, 6);
  });

  it('derives original and simulated quarter peaks after battery dispatch', () => {
    const blocks = [
      block('2026-06-01T12:00:00', { injectie: 1 }),
      block('2026-06-01T18:00:00', { afname: 2 }), // 8 kW original quarter peak
    ];
    const result = simulateVirtualBattery(blocks, CFG, {
      mode: 'realistic', pvInv: 5, priceDay: 0.32, injectionPrice: 0.03,
      capacityTariffRate: 56.59,
    });
    expect(result.capacityTariff.available).toBe(true);
    expect(result.capacityTariff.months[0].originalKw).toBeCloseTo(8, 6);
    // 0.625 kWh enters; after 90% round-trip efficiency 0.5625 kWh is delivered.
    expect(result.capacityTariff.months[0].simulatedKw).toBeCloseTo(5.75, 6);
  });
});

describe('buildCapacityTariffResult', () => {
  it('applies the statutory 2.5 kW monthly floor', () => {
    const result = buildCapacityTariffResult([
      { month: '2026-01', originalKw: 3, simulatedKw: 1 },
      { month: '2026-02', originalKw: 2, simulatedKw: 0.5 },
    ], 50);
    expect(result.originalAverageKw).toBeCloseTo(2.75, 6);
    expect(result.simulatedAverageKw).toBeCloseTo(2.5, 6);
    expect(result.annualSaving).toBeCloseTo(12.5, 6);
  });
});
