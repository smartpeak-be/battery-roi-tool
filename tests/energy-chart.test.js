import { describe, expect, test } from 'vitest';
import { buildChartConfig } from '../assets/js/index/energy-chart.js';

describe('energy chart config', () => {
  test('uses a symmetric y-axis around zero for single tariff data', () => {
    const cfg = buildChartConfig([
      { label: 'jan', afname: 100, injectie: 40 },
      { label: 'feb', afname: 20, injectie: 160 },
    ], false);

    expect(cfg.options.scales.y.min).toBe(-160);
    expect(cfg.options.scales.y.max).toBe(160);
  });

  test('uses stacked totals to keep dual tariff afname and injectie visually comparable', () => {
    const cfg = buildChartConfig([
      {
        label: 'jan',
        afnamedag: 70,
        afnamenacht: 50,
        injectiedag: 20,
        injectienacht: 25,
      },
      {
        label: 'feb',
        afnamedag: 10,
        afnamenacht: 15,
        injectiedag: 90,
        injectienacht: 80,
      },
    ], true);

    expect(cfg.options.scales.y.min).toBe(-170);
    expect(cfg.options.scales.y.max).toBe(170);
  });
});
