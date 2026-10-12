import { describe, it, expect } from 'vitest';
import { renderResult, yearlyFigures } from '../assets/js/lead-result/renderers.js';

const days = 365;
const dailyCompact = {
  startDate: '2025-01-01',
  afname: Array(days).fill(10),
  injectie: Array(days).fill(8),
  afnamedag: [], afnamenacht: [], injectiedag: [], injectienacht: []
};
const lead = {
  pricePerKwh: 0.34,
  csvDailyCompact: dailyCompact,
  defaultsUsed: { pvInverterKw: true },
  result: {
    isRange: true,
    batteryCapKwh: { min: 5.76, max: 8.64 },
    roiYears: { min: 7.2, max: 9.9 },
    annualSavingEur: { min: 340, max: 408 }
  }
};

describe('lead result page', () => {
  it('turns the stored saving back into kWh the battery takes over', () => {
    const y = yearlyFigures(lead);
    expect(Math.round(y.afname)).toBe(3650);
    expect(Math.round(y.stored.min)).toBe(1000);
    expect(Math.round(y.stored.max)).toBe(1200);
  });

  it('shows kWh and a size, but no payback time or euro promise', () => {
    const html = renderResult(lead);
    expect(html).toContain('1.000 tot 1.200 kWh');
    expect(html).toContain('5,8 tot 8,6 kWh');
    expect(html).toContain('Waarom geen terugverdientijd?');
    expect(html).not.toMatch(/7,2|9,9|€/);
  });

  it('explains other reasons for a battery when no size comes out of the data', () => {
    const html = renderResult({ ...lead, result: null });
    expect(html).toContain('geen duidelijke batterijgrootte');
    expect(html).toContain('capaciteitstarief');
    expect(html).not.toContain('verdient zich');
  });
});
