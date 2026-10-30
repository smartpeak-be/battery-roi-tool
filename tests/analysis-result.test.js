import { describe, it, expect } from 'vitest';
import { renderAnalysisResult, yearlyTotals } from '../assets/js/widgets/analysis-result.js';
import { buildPublicIndication } from '../assets/js/lead-calc.js';

const year = (afname, injectie) => Array.from({ length: 365 }, (_, i) => ({
  date: new Date(2025, 0, 1 + i), afname, injectie, afnamedag: 0, afnamenacht: 0, injectiedag: 0, injectienacht: 0
}));

describe('public analysis result (website widget)', () => {
  it('shows a sensible capacity, the kWh and the saving, with the caveats', () => {
    const days = year(10, 8);
    const html = renderAnalysisResult(buildPublicIndication(days, 0.39), yearlyTotals(days));
    expect(html).toContain('tot ± 7,5 kWh');
    expect(html).toContain('± 2.460 kWh');
    expect(html).toContain('tot € 1.000');
    expect(html).toContain('aan 0,39 euro per kWh');
    expect(html).toMatch(/dynamisch energiecontract/);
    expect(html).toMatch(/bewust groter/);
    expect(html).not.toMatch(/terugverdien|gratis/i);
  });

  it('names the visitor\'s own price', () => {
    const days = year(10, 8);
    const html = renderAnalysisResult(buildPublicIndication(days, 0.31), yearlyTotals(days), { priceGiven: true });
    expect(html).toContain('jouw prijs van 0,31 euro per kWh');
  });

  it('explains other uses when the data gives no size', () => {
    const days = year(10, 1);
    const html = renderAnalysisResult(buildPublicIndication(days, 0.39), yearlyTotals(days));
    expect(html).toContain('geen duidelijke batterijgrootte');
    expect(html).not.toContain('€');
  });
});
