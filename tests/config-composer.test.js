import { describe, expect, it } from 'vitest';
import {
  ensureInspectionLine,
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
];

describe('config composer', () => {
  it('adds or removes an automatic inspection line based on keuring choice', () => {
    const withInspection = ensureInspectionLine([], products[0], 'yes');
    expect(withInspection).toEqual([
      expect.objectContaining({ kind: 'inspection', productId: 'inspection', automatic: true, vat: 21, amountExVat: 150 }),
    ]);

    const withoutInspection = ensureInspectionLine(withInspection, products[0], 'no');
    expect(withoutInspection).toEqual([]);
  });

  it('resolves product, manual, discount and inspection lines into the calculator price', () => {
    const composition = {
      type: 'PC_cfg-1',
      baseProductConfigId: 'cfg-1',
      lines: ensureInspectionLine([
        { id: 'line-product', kind: 'product', productId: 'shelf', qty: 2, vat: 6 },
        { id: 'line-manual', kind: 'manual', description: 'Extra kabel', amountExVat: 40, vat: 6 },
        { id: 'line-discount', kind: 'discount', description: 'Afrondingskorting', amountExVat: -25, vat: 6 },
      ], products[0], 'yes'),
    };

    const resolved = resolveCompositionToCalculatorConfig(baseConfig, composition, products, { btwPercent: 6 });

    // Base 2000 incl. 6%, product line 2*(100+50)*1.06, manual 40*1.06, discount -25*1.06, inspection 150*1.21.
    expect(resolved.price).toBeCloseTo(2000 + 300 * 1.06 + 40 * 1.06 - 25 * 1.06 + 150 * 1.21);
    expect(resolved.basePrice).toBeCloseTo(2000);
    expect(resolved.source).toBe('productConfig');
    expect(resolved.productConfigId).toBe('cfg-1');
    expect(resolved.composition.lines).toHaveLength(4);
  });

  it('serializes only meaningful adjustable composition lines and blocks inspection products', () => {
    const lines = serializeCompositionLines([
      { id: 'auto-inspection', kind: 'inspection', productId: 'inspection', amountExVat: 150, vat: 21, automatic: true },
      { id: 'manual-inspection', kind: 'product', productId: 'inspection', qty: 1, vat: 21 },
      { id: 'empty', kind: 'manual', description: '', amountExVat: 0, vat: 6 },
      { id: 'discount', kind: 'discount', description: 'Korting', amountExVat: -10, vat: 6 },
    ], { inspectionProductId: 'inspection' });

    expect(lines).toEqual([
      { id: 'discount', kind: 'discount', description: 'Korting', amountExVat: -10, vat: 6 },
    ]);
  });

  it('hides inspection products from composer product choices', () => {
    expect(selectableComposerProducts(products).map(p => p.id)).toEqual(['shelf']);
  });
});
