import { describe, expect, it } from 'vitest';
import {
  productConfigToCalcConfig,
  productConfigsToCalcConfigs,
} from '../assets/js/product-config-resolver.js';

const categories = [
  { id: 'cat-system', slug: 'thuisbatterij-systemen', name: 'Systemen' },
  { id: 'cat-battery', slug: 'batterijen', name: 'Batterijen' },
  { id: 'cat-service', slug: 'service', name: 'Service' },
  { id: 'cat-material', slug: 'materiaal', name: 'Materiaal' },
  { id: 'cat-accessory', slug: 'accessoires', name: 'Accessoires' },
];

const products = [
  {
    id: 'solarflow',
    categoryId: 'cat-system',
    brand: 'Zendure',
    model: 'SolarFlow 2400 AC+',
    purchasePrice: 1000,
    marginType: 'percent',
    marginValue: 20,
    discountType: 'percent',
    discountValue: 10,
    discountFromUnit: 2,
    specs: { capacityKwh: 2.4, inverterPowerKw: 2.4, efficiency: 93 },
  },
  {
    id: 'ab3000l',
    categoryId: 'cat-battery',
    brand: 'Zendure',
    model: 'AB3000L',
    purchasePrice: 500,
    marginType: 'percent',
    marginValue: 30,
    discountType: 'percent',
    discountValue: 5,
    discountFromUnit: 2,
    specs: { capacityKwh: 2.88 },
  },
  {
    id: 'install',
    categoryId: 'cat-service',
    brand: '',
    model: 'Installatiekost',
    purchasePrice: 0,
    marginType: 'fixed',
    marginValue: 350,
    discountType: 'fixed',
    discountValue: 0,
    discountFromUnit: 2,
    serviceKey: 'installation',
    specs: { serviceKey: 'installation' },
  },
  {
    id: 'inspection',
    categoryId: 'cat-service',
    brand: '',
    model: 'Keuring',
    purchasePrice: 150,
    marginType: 'fixed',
    marginValue: 0,
    serviceKey: 'inspection',
    specs: { serviceKey: 'inspection' },
  },
  {
    id: 'p1',
    categoryId: 'cat-accessory',
    brand: 'Zendure',
    model: 'Slimme Meter P1',
    purchasePrice: 76.67,
    marginType: 'percent',
    marginValue: 28,
    discountType: 'percent',
    discountValue: 10,
    discountFromUnit: 5,
    specs: {},
  },
  {
    id: 'cable',
    categoryId: 'cat-material',
    brand: 'LAN',
    model: 'Netwerkkabel',
    purchasePrice: 1,
    marginType: 'fixed',
    marginValue: 1,
    specs: {},
  },
];

const config = {
  id: 'cfg-1',
  name: 'ZSF2400AC+1x1',
  description: '',
  isActive: true,
  items: [
    { productId: 'solarflow', qty: 1 },
    { productId: 'ab3000l', qty: 1 },
    { productId: 'install', qty: 1 },
    { productId: 'p1', qty: 1 },
  ],
};

describe('productConfigToCalcConfig', () => {
  it('uses exactly the stored composition items and totals in the calculator', () => {
    const resolved = productConfigToCalcConfig(config, products, categories, { inspectionProductId: 'inspection' });

    expect(resolved.type).toBe('PC_cfg-1');
    expect(resolved.source).toBe('productConfig');
    expect(resolved.productConfigId).toBe('cfg-1');
    expect(resolved.omschrijving).toBe('Zendure SolarFlow 2400 AC+ & Zendure AB3000L & Installatiekost & Zendure Slimme Meter P1');
    expect(resolved.batCap).toBeCloseTo(5.28);
    expect(resolved.batInv).toBeCloseTo(2.4);
    expect(resolved.eff).toBeCloseTo(0.93);

    // Excl: only the stored lines: 1200 + 650 + 350 + 98.1376 = 2298.1376.
    expect(resolved.prices['6_no']).toBeCloseTo(2298.1376 * 1.06);
    expect(resolved.prices['21_no']).toBeCloseTo(2298.1376 * 1.21);
    expect(resolved.prices['6_yes']).toBeCloseTo(2298.1376 * 1.06);
    expect(resolved.prices['21_yes']).toBeCloseTo(2298.1376 * 1.21);
    expect(resolved.items).toEqual(config.items);
    expect(resolved.items).not.toContainEqual({ productId: 'inspection', qty: 1 });
  });

  it('keeps product-config prices compatible with existing extra-cost lines', () => {
    const resolved = productConfigToCalcConfig(config, products, categories, { inspectionProductId: 'inspection' });
    const lines = [{ description: 'Extra schap', amountInclBtw: 106 }];
    const price = resolved.prices['6_no'] + lines.reduce((sum, line) => sum + line.amountInclBtw, 0);

    expect(price).toBeCloseTo(2298.1376 * 1.06 + 106);
  });

  it('filters inactive or technically incomplete product configs while keeping active valid ones', () => {
    const all = productConfigsToCalcConfigs([
      config,
      { ...config, id: 'inactive', isActive: false },
      { ...config, id: 'no-battery', items: [{ productId: 'p1', qty: 1 }] },
    ], products, categories, { inspectionProductId: 'inspection' });

    expect(all.map(c => c.type)).toEqual(['PC_cfg-1']);
  });

  it('treats product configurations as B2C by default and excludes B2B from calculator choices', () => {
    const all = productConfigsToCalcConfigs([
      { ...config, id: 'default-b2c', name: 'Zendure standaard' },
      { ...config, id: 'explicit-b2c', name: 'Zendure particulier', customerType: 'b2c' },
      { ...config, id: 'explicit-b2b', name: 'Zendure zakelijk', customerType: 'b2b' },
      { ...config, id: 'name-b2b', name: 'Zendure B2B pakket' },
    ], products, categories);

    expect(all.map(c => c.type)).toEqual(['PC_default-b2c', 'PC_explicit-b2c']);
    expect(all.every(c => c.customerType === 'b2c')).toBe(true);
  });

  it('can explicitly resolve B2B product configurations for future B2B views', () => {
    const all = productConfigsToCalcConfigs([
      { ...config, id: 'default-b2c', name: 'Zendure standaard' },
      { ...config, id: 'name-b2b', name: 'Zendure B2B pakket' },
    ], products, categories, { includeCustomerTypes: ['b2b'] });

    expect(all.map(c => c.type)).toEqual(['PC_name-b2b']);
    expect(all[0].customerType).toBe('b2b');
    expect(all[0].items.some(item => item.productId === 'inspection')).toBe(false);
  });

  it('inherits product grid compatibility and filters by the project connection type', () => {
    const compatibleProducts = products.map(product => product.id === 'solarflow'
      ? { ...product, gridCompatibility: ['1x230', '1x230-delta'] }
      : product);

    const onePhase = productConfigsToCalcConfigs([config], compatibleProducts, categories, {
      connectionType: '1x230-delta',
    });
    const threePhase = productConfigsToCalcConfigs([config], compatibleProducts, categories, {
      connectionType: '3x400+N',
    });

    expect(onePhase).toHaveLength(1);
    expect(onePhase[0].gridCompatibility).toEqual(['1x230', '1x230-delta']);
    expect(threePhase).toEqual([]);
  });

  it('keeps legacy compositions visible when products have no grid metadata yet', () => {
    const resolved = productConfigsToCalcConfigs([config], products, categories, {
      connectionType: '3x230',
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].gridCompatibility).toEqual([]);
  });
});
