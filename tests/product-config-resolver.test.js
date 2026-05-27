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
  it('converts a Firestore product composition into a calculator config with price variants', () => {
    const resolved = productConfigToCalcConfig(config, products, categories, { inspectionProductId: 'inspection' });

    expect(resolved.type).toBe('PC_cfg-1');
    expect(resolved.source).toBe('productConfig');
    expect(resolved.productConfigId).toBe('cfg-1');
    expect(resolved.omschrijving).toBe('Zendure SolarFlow 2400 AC+ & Zendure AB3000L & Installatiekost & Zendure Slimme Meter P1');
    expect(resolved.batCap).toBeCloseTo(5.28);
    expect(resolved.batInv).toBeCloseTo(2.4);
    expect(resolved.eff).toBeCloseTo(0.93);

    // Excl: 1200 + 650 + 350 + 98.1376 = 2298.1376.
    expect(resolved.prices['6_no']).toBeCloseTo(2298.1376 * 1.06);
    expect(resolved.prices['21_no']).toBeCloseTo(2298.1376 * 1.21);
    // Product-samenstellingen voegen keuring later als expliciete composer-lijn toe,
    // zodat alle gekozen samenstellingen samen reageren op de keuringkeuze.
    expect(resolved.prices['6_yes']).toBeCloseTo(2298.1376 * 1.06);
    expect(resolved.prices['21_yes']).toBeCloseTo(2298.1376 * 1.21);
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
});
