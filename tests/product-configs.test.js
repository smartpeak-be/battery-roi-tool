import { describe, expect, it } from 'vitest';
import {
  bebatTotalInclVat,
  configBatteryWeightKg,
  configItemsExceptCategorySlug,
  configItemsExceptCategorySlugs,
  configItemsForCategorySlug,
  configSubtotalExVat,
  generatedConfigDescription,
  productMap,
  categoryMap,
  addAmountsToVatGroups,
  quoteGroupSubtotalExVat,
} from '../assets/js/product-configs.js';

const categories = [
  { id: 'cat-bat', slug: 'batterijen', name: 'Batterijen' },
  { id: 'cat-system', slug: 'thuisbatterij-systemen', name: 'Systemen' },
  { id: 'cat-inv', slug: 'omvormers', name: 'Omvormers' },
  { id: 'cat-mat', slug: 'materiaal', name: 'Materiaal' },
  { id: 'cat-misc', slug: 'diversen', name: 'Diversen' },
  { id: 'cat-service', slug: 'service', name: 'Service' },
];

const products = [
  {
    id: 'acplus',
    categoryId: 'cat-system',
    brand: 'Zendure',
    model: 'AC+',
    purchasePrice: 1000,
    marginType: 'percent',
    marginValue: 20,
    discountType: 'percent',
    discountValue: 10,
    discountFromUnit: 2,
    specs: { weightKg: 27.8 },
  },
  {
    id: 'ab3000l',
    categoryId: 'cat-bat',
    brand: 'Zendure',
    model: 'AB3000L',
    purchasePrice: 600,
    marginType: 'fixed',
    marginValue: 100,
    discountType: 'fixed',
    discountValue: 50,
    discountFromUnit: 2,
    specs: { weightKg: 26.3 },
  },
  {
    id: 'inverter',
    categoryId: 'cat-inv',
    brand: 'Huawei',
    model: 'SUN2000',
    purchasePrice: 500,
    marginType: 'percent',
    marginValue: 20,
    specs: { weightKg: 10 },
  },
  {
    id: 'rail',
    categoryId: 'cat-mat',
    brand: 'SmartPeak',
    model: 'Rail',
    purchasePrice: 40,
    marginType: 'fixed',
    marginValue: 10,
    specs: {},
  },
  {
    id: 'buffer',
    categoryId: 'cat-misc',
    brand: 'SmartPeak',
    model: 'Buffer',
    purchasePrice: 100,
    marginType: 'fixed',
    marginValue: 0,
    specs: {},
  },
  {
    id: 'install',
    categoryId: 'cat-service',
    brand: 'SmartPeak',
    model: 'Installatiekost',
    purchasePrice: 250,
    marginType: 'fixed',
    marginValue: 0,
    specs: {},
  },
];

const pMap = productMap(products);
const cMap = categoryMap(categories);

describe('product config helpers', () => {
  it('generates customer-facing description from all config products', () => {
    expect(generatedConfigDescription([
      { productId: 'acplus', qty: 2 },
      { productId: 'ab3000l', qty: 3 },
      { productId: 'install', qty: 1 },
      { productId: 'rail', qty: 1 },
      { productId: 'buffer', qty: 1 },
    ], pMap, cMap)).toBe('2x Zendure AC+ & 3x Zendure AB3000L & Installatiekost & Rail & Buffer');
  });

  it('calculates full config subtotal ex VAT including services', () => {
    expect(configSubtotalExVat([
      { productId: 'acplus', qty: 2 },
      { productId: 'ab3000l', qty: 2 },
      { productId: 'install', qty: 1 },
    ], pMap, cMap)).toBeCloseTo(1200 + 1080 + 700 + 650 + 250);
  });

  it('adds manual installation amounts to an existing VAT group without duplicating items', () => {
    const groups = addAmountsToVatGroups([
      { vat: 21, items: [{ productId: 'acplus', qty: 1 }, { productId: 'install', qty: 1 }] },
    ], [
      { kind: 'installation_extra', description: 'Extra installatiekost', exVat: 150, vat: 21 },
    ]);

    expect(groups).toEqual([
      {
        vat: 21,
        items: [{ productId: 'acplus', qty: 1 }, { productId: 'install', qty: 1 }],
        extraExVat: 150,
      },
    ]);
    expect(quoteGroupSubtotalExVat(groups[0], pMap)).toBeCloseTo(1200 + 250 + 150);
  });

  it('creates a VAT group for manual installation amounts when no matching group exists', () => {
    const groups = addAmountsToVatGroups([], [
      { kind: 'installation_extra', description: 'Extra installatiekost', exVat: 90, vat: 6 },
    ]);

    expect(groups).toEqual([
      {
        vat: 6,
        items: [],
        description: 'Extra installatiekost',
        extraExVat: 90,
      },
    ]);
    expect(quoteGroupSubtotalExVat(groups[0], pMap)).toBeCloseTo(90);
  });

  it('splits material items from the main quote line', () => {
    const items = [
      { productId: 'acplus', qty: 1 },
      { productId: 'rail', qty: 2 },
      { productId: 'buffer', qty: 1 },
      { productId: 'install', qty: 1 },
    ];
    expect(configItemsForCategorySlug(items, pMap, cMap, 'materiaal')).toEqual([{ productId: 'rail', qty: 2 }]);
    expect(configItemsExceptCategorySlug(items, pMap, cMap, 'materiaal')).toEqual([
      { productId: 'acplus', qty: 1 },
      { productId: 'buffer', qty: 1 },
      { productId: 'install', qty: 1 },
    ]);
    expect(configItemsExceptCategorySlugs(items, pMap, cMap, ['materiaal', 'diversen'])).toEqual([
      { productId: 'acplus', qty: 1 },
      { productId: 'install', qty: 1 },
    ]);
  });

  it('counts only battery/system products for Bebat weight', () => {
    expect(configBatteryWeightKg([
      { productId: 'acplus', qty: 1 },
      { productId: 'ab3000l', qty: 3 },
      { productId: 'inverter', qty: 2 },
    ], pMap, cMap)).toBeCloseTo(27.8 + 3 * 26.3);
  });

  it('handles deleted products gracefully', () => {
    expect(configSubtotalExVat([{ productId: 'missing', qty: 2 }], pMap, cMap)).toBe(0);
    expect(generatedConfigDescription([{ productId: 'missing', qty: 2 }], pMap, cMap)).toBe('');
  });

  it('calculates Bebat including fixed 21% VAT', () => {
    expect(bebatTotalInclVat(60, 0.5)).toBeCloseTo(36.3);
  });
});
