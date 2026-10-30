import { describe, it, expect } from 'vitest';
import { renderResult, yearlyFigures } from '../assets/js/lead-result/renderers.js';

const days = 365;
const compact = (afname, injectie) => ({
  startDate: '2025-01-01',
  afname: Array(days).fill(afname),
  injectie: Array(days).fill(injectie),
  afnamedag: [], afnamenacht: [], injectiedag: [], injectienacht: []
});
const lead = {
  pricePerKwh: 0.39,
  csvDailyCompact: compact(10, 8),
  defaultsUsed: { pvInverterKw: true, pricePerKwh: true },
  result: {
    isRange: true,
    batteryCapKwh: { min: 5.76, max: 8.64 },
    roiYears: { min: 7.2, max: 9.9 },
    annualSavingEur: { min: 340, max: 408 }
  }
};

describe('lead result page', () => {
  it('uses the battery size from the data, not the cheapest product', () => {
    const y = yearlyFigures(lead);
    expect(Math.round(y.afname)).toBe(3650);
    expect(y.stored.max).toBe(2464);
  });

  it('shows kWh, a size and a yearly saving "up to", but no payback time or product', () => {
    const html = renderResult(lead);
    expect(html).toContain('± 2.460 kWh');
    expect(html).toContain('7,5 kWh');
    expect(html).toContain('tot € 1.000 per jaar');
    expect(html).toContain('zelfverbruik');
    expect(html).toContain('dynamisch energiecontract');
    expect(html).toContain('0,39 euro per kWh, een gangbare prijs');
    expect(html).toContain('Waarom geen terugverdientijd?');
    expect(html).not.toMatch(/7,2|9,9|5,8 tot 8,6/);
  });

  it('mentions the customer\'s own price when they gave one', () => {
    const html = renderResult({ ...lead, pricePerKwh: 0.31, defaultsUsed: { pricePerKwh: false } });
    expect(html).toContain('jouw prijs van 0,31 euro per kWh');
  });

  it('explains other reasons for a battery when no size comes out of the data', () => {
    const html = renderResult({ ...lead, csvDailyCompact: compact(10, 1), result: null });
    expect(html).toContain('geen duidelijke batterijgrootte');
    expect(html).toContain('capaciteitstarief');
    expect(html).not.toContain('€');
  });
});
