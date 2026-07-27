import { describe, expect, it } from 'vitest';
import {
  resolveCompositionToCalculatorConfig,
  selectableComposerProducts,
  serializeCompositionLines,
} from '../assets/js/config-composer.js';

const baseConfig = {
  type: 'PC_cfg-1',
  source: 'productConfig',
  productConfigId: 'cfg-1',
  productConfigName: 'Zendure basis',
  omschrijving: 'Zendure basis',
  batCap: 5.28,
  batInv: 2.4,
  eff: 0.93,
  prices: {
    '6_no': 2000,
    '6_yes': 2000,
    '21_no': 2420,
    '21_yes': 2420,
  },
};

const products = [
  { id: 'inspection', brand: '', model: 'Keuring', purchasePrice: 150, marginType: 'fixed', marginValue: 0, serviceKey: 'inspection', specs: { serviceKey: 'inspection' } },
  { id: 'shelf', brand: 'Rack', model: 'Batterijschap', purchasePrice: 100, marginType: 'fixed', marginValue: 50, specs: {} },
  { id: 'battery', categoryId: 'battery-cat', brand: 'Zendure', model: 'AB3000X', purchasePrice: 500, marginType: 'fixed', marginValue: 100, specs: { capacityKwh: 3.84, weightKg: 27.8 } },
  { id: 'inverter', categoryId: 'inverter-cat', brand: 'Zendure', model: 'Solarflow 2400 AC', purchasePrice: 800, marginType: 'fixed', marginValue: 200, specs: { inverterPowerKw: 2.4, efficiency: 93 } },
];

const categories = [
  { id: 'battery-cat', slug: 'batterijen', name: 'Batterijen' },
  { id: 'inverter-cat', slug: 'omvormers', name: 'Omvormers' },
];

describe('config composer', () => {
  it('resolves exactly the selected product, manual, discount and inspection lines into the calculator price', () => {
    const composition = {
      type: 'PC_cfg-1',
      baseProductConfigId: 'cfg-1',
      lines: [
        { id: 'line-product', kind: 'product', productId: 'shelf', qty: 2, vat: 6 },
        { id: 'line-manual', kind: 'manual', description: 'Extra kabel', amountExVat: 40, vat: 6 },
        { id: 'line-discount', kind: 'discount', description: 'Afrondingskorting', amountExVat: -25, vat: 6 },
        { id: 'line-inspection', kind: 'product', productId: 'inspection', qty: 1, vat: 6 },
      ],
    };

    const resolved = resolveCompositionToCalculatorConfig(baseConfig, composition, products, { btwPercent: 6 });

    // Base 2000 incl. 6%, product line 2*(100+50)*1.06, manual 40*1.06, discount -25*1.06, inspection 150*1.06.
    expect(resolved.price).toBeCloseTo(2000 + 300 * 1.06 + 40 * 1.06 - 25 * 1.06 + 150 * 1.06);
    expect(resolved.basePrice).toBeCloseTo(2000);
    expect(resolved.source).toBe('productConfig');
    expect(resolved.productConfigId).toBe('cfg-1');
    expect(resolved.composition.lines).toHaveLength(4);
  });

  it('changes the total only when inspection is explicitly present as a composition product', () => {
    const base = {
      ...baseConfig,
      type: 'CUSTOM_TOTALS',
      prices: { '6_no': 0, '6_yes': 0, '21_no': 0, '21_yes': 0 },
    };
    const batteryLine = { id: 'battery-line', kind: 'product', productId: 'battery', qty: 1, vat: 6 };

    const withoutInspection = resolveCompositionToCalculatorConfig(base, {
      type: 'CUSTOM_TOTALS',
      lines: [batteryLine],
    }, products, { btwPercent: 6, categories, bebatPricePerKg: 0 });
    const withInspection = resolveCompositionToCalculatorConfig(base, {
      type: 'CUSTOM_TOTALS',
      lines: [
        batteryLine,
        { id: 'inspection-line', kind: 'product', productId: 'inspection', qty: 1, vat: 6 },
      ],
    }, products, { btwPercent: 6, categories, bebatPricePerKg: 0 });

    expect(withInspection.price - withoutInspection.price).toBeCloseTo(150 * 1.06);
  });

  it('preserves the customer-facing composition explanation on resolved configs', () => {
    const resolved = resolveCompositionToCalculatorConfig({
      ...baseConfig,
      type: 'CUSTOM_1',
      compositionDescription: 'Extra uitleg uit basisconfig',
    }, {
      type: 'CUSTOM_1',
      description: 'Deze uitleg komt op de klant-view.',
      lines: [],
    }, products, { btwPercent: 6 });

    expect(resolved.compositionDescription).toBe('Extra uitleg uit basisconfig');
  });

  it('falls back to the composition explanation when the base config has none', () => {
    const resolved = resolveCompositionToCalculatorConfig({
      ...baseConfig,
      type: 'CUSTOM_2',
      compositionDescription: '',
    }, {
      type: 'CUSTOM_2',
      description: 'Deze uitleg komt op de klant-view.',
      lines: [],
    }, products, { btwPercent: 6 });

    expect(resolved.compositionDescription).toBe('Deze uitleg komt op de klant-view.');
  });

  it('serializes only meaningful adjustable composition lines and allows explicitly selected inspection products', () => {
    const lines = serializeCompositionLines([
      { id: 'auto-inspection', kind: 'inspection', productId: 'inspection', amountExVat: 150, vat: 21, automatic: true },
      { id: 'manual-inspection', kind: 'product', productId: 'inspection', qty: 1, vat: 21 },
      { id: 'empty', kind: 'manual', description: '', amountExVat: 0, vat: 6 },
      { id: 'discount', kind: 'discount', description: 'Korting', amountExVat: -10, vat: 6 },
    ], { inspectionProductId: 'inspection' });

    expect(lines).toEqual([
      { id: 'manual-inspection', kind: 'product', productId: 'inspection', qty: 1, description: '', amountExVat: 0, vat: 21 },
      { id: 'discount', kind: 'discount', description: 'Korting', amountExVat: -10, vat: 6 },
    ]);
  });

  it('adds Bebat to the calculator customer price for battery items', () => {
    const resolved = resolveCompositionToCalculatorConfig({
      ...baseConfig,
      items: [{ productId: 'battery', qty: 1 }],
    }, { type: 'PC_cfg-1', baseProductConfigId: 'cfg-1', lines: [] }, products, {
      btwPercent: 6,
      categories,
      bebatPricePerKg: 2.89,
    });

    expect(resolved.price).toBeCloseTo(2000 + (27.8 * 2.89 * 1.21));
    expect(resolved.compositionLines).toEqual([
      expect.objectContaining({
        kind: 'bebat',
        automatic: true,
        vat: 21,
        amountInclBtw: 27.8 * 2.89 * 1.21,
      }),
    ]);
  });

  it('resolves from-scratch product lines into calculator capacity, power and price', () => {
    const resolved = resolveCompositionToCalculatorConfig({
      type: 'CUSTOM_1',
      source: 'customComposition',
      omschrijving: 'Nieuwe samenstelling',
      prices: { '6_no': 0, '6_yes': 0, '21_no': 0, '21_yes': 0 },
      items: [],
    }, {
      type: 'CUSTOM_1',
      lines: [
        { id: 'battery-line', kind: 'product', productId: 'battery', qty: 2, vat: 6 },
        { id: 'inverter-line', kind: 'product', productId: 'inverter', qty: 1, vat: 6 },
      ],
    }, products, { btwPercent: 6, categories, bebatPricePerKg: 0 });

    expect(resolved.batCap).toBeCloseTo(7.68);
    expect(resolved.batInv).toBeCloseTo(2.4);
    expect(resolved.eff).toBeCloseTo(0.93);
    expect(resolved.price).toBeCloseTo(((500 + 100) * 2 + (800 + 200)) * 1.06);
    expect(resolved.omschrijving).toContain('2x Zendure AB3000X');
    expect(resolved.compositionLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'product', productId: 'battery', qty: 2 }),
      expect.objectContaining({ kind: 'product', productId: 'inverter', qty: 1 }),
    ]));
  });

  it('uses the entered existing inverter power for battery-only compositions', () => {
    const resolved = resolveCompositionToCalculatorConfig({
      type: 'CUSTOM_BATTERY_ONLY',
      source: 'customComposition',
      omschrijving: 'Batterij op bestaande omvormer',
      prices: { '6_no': 0, '6_yes': 0, '21_no': 0, '21_yes': 0 },
      items: [],
    }, {
      type: 'CUSTOM_BATTERY_ONLY',
      lines: [{ id: 'battery-line', kind: 'product', productId: 'battery', qty: 2, vat: 6 }],
    }, products, {
      btwPercent: 6,
      categories,
      bebatPricePerKg: 0,
      existingInverterPowerKw: 5,
    });

    expect(resolved.batCap).toBeCloseTo(7.68);
    expect(resolved.batInv).toBeCloseTo(5);
    expect(resolved.requiresExistingInverterPower).toBe(true);
  });

  it('shows inspection products in composer product choices', () => {
    expect(selectableComposerProducts(products).map(p => p.id)).toEqual(['inspection', 'shelf', 'battery', 'inverter']);
  });
});
