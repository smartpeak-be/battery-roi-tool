import { describe, expect, it } from 'vitest';
import {
  GRID_CONNECTION_TYPES,
  gridConnectionLabel,
  normalizeGridCompatibility,
  productConfigGridCompatibility,
  productSupportsGridConnection,
} from '../assets/js/grid-compatibility.js';

describe('grid compatibility', () => {
  it('defines the four Belgian connection types in canonical order', () => {
    expect(GRID_CONNECTION_TYPES.map(type => type.value)).toEqual([
      '1x230',
      '1x230-delta',
      '3x230',
      '3x400+N',
    ]);
    expect(gridConnectionLabel('1x230-delta')).toContain('2 fasen');
  });

  it('normalizes aliases, removes invalid values and deduplicates', () => {
    expect(normalizeGridCompatibility([
      '3x400+n',
      '1x230-delta',
      'unknown',
      '3x400+N',
    ])).toEqual(['1x230-delta', '3x400+N']);
  });

  it('computes a composition as the intersection of constrained AC products', () => {
    const products = {
      inverter: { id: 'inverter', gridCompatibility: ['1x230', '1x230-delta'] },
      meter: { id: 'meter', gridCompatibility: ['1x230'] },
      battery: { id: 'battery' },
    };
    const result = productConfigGridCompatibility({
      items: [
        { productId: 'inverter', qty: 1 },
        { productId: 'meter', qty: 1 },
        { productId: 'battery', qty: 1 },
      ],
    }, products);

    expect(result).toEqual({
      gridCompatibility: ['1x230'],
      constrainedProductCount: 2,
      hasConflict: false,
    });
  });

  it('marks conflicting constrained products as incompatible', () => {
    const result = productConfigGridCompatibility({
      items: [{ productId: 'a', qty: 1 }, { productId: 'b', qty: 1 }],
    }, {
      a: { gridCompatibility: ['1x230'] },
      b: { gridCompatibility: ['3x400+N'] },
    });

    expect(result.gridCompatibility).toEqual([]);
    expect(result.constrainedProductCount).toBe(2);
    expect(result.hasConflict).toBe(true);
  });

  it('keeps legacy unconstrained products compatible until metadata is filled', () => {
    expect(productSupportsGridConnection({}, '3x230')).toBe(true);
    expect(productSupportsGridConnection({ gridCompatibility: ['1x230'] }, '3x230')).toBe(false);
    expect(productSupportsGridConnection({ gridCompatibility: ['1x230'] }, '')).toBe(true);
  });
});
