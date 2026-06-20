import { describe, expect, it } from 'vitest';
import {
  calculateSolutionSummary,
  itemSnapshotFromProduct,
  solutionProductOptions,
  solutionSummaryLabel,
} from '../assets/js/project-solution.js';

describe('project solution helpers', () => {
  it('filters products to batteries, inverters and home-battery systems', () => {
    const categories = [
      { id: 'cat-inv', slug: 'omvormers' },
      { id: 'cat-bat', slug: 'batterijen' },
      { id: 'cat-mat', slug: 'materiaal' },
    ];
    const products = [
      { id: 'p1', categoryId: 'cat-inv', brand: 'Zendure', model: 'Hyper 2000', specs: { inverterPowerKw: 2.4 } },
      { id: 'p2', categoryId: 'cat-bat', brand: 'Zendure', model: 'AB2000', specs: { capacityKwh: 1.92 } },
      { id: 'p3', categoryId: 'cat-mat', brand: 'Kabel', model: 'AC', specs: {} },
    ];

    const options = solutionProductOptions(products, categories);

    expect(options.map(o => o.id)).toEqual(['p2', 'p1']);
    expect(options.find(o => o.id === 'p1').kind).toBe('inverter');
    expect(options.find(o => o.id === 'p2').kind).toBe('battery');
  });

  it('calculates inverter W and storage kWh from product specs and quantities', () => {
    const hyper = itemSnapshotFromProduct({
      id: 'hyper',
      label: 'Zendure Hyper 2000',
      kind: 'inverter',
      specs: { inverterPowerKw: 2.4 },
    }, 2);
    const battery = itemSnapshotFromProduct({
      id: 'ab2000',
      label: 'Zendure AB2000',
      kind: 'battery',
      specs: { capacityKwh: 1.92 },
    }, 3);

    const summary = calculateSolutionSummary({ items: [hyper, battery] });

    expect(summary.inverterPowerW).toBe(4800);
    expect(summary.storageKwh).toBe(5.76);
    expect(summary.publicLabel).toBe('geplaatst omvormvermogen 4800 W · geplaatste opslag 5.76 kWh');
  });

  it('supports manual entries for custom combinations', () => {
    const summary = calculateSolutionSummary({
      items: [{
        id: 'manual',
        source: 'manual',
        kind: 'system',
        label: 'Manuele combinatie',
        quantity: 2,
        inverterPowerKw: 1.2,
        capacityKwh: 2.5,
      }],
    });

    expect(solutionSummaryLabel(summary)).toBe('geplaatst omvormvermogen 2400 W · geplaatste opslag 5 kWh');
  });
});
