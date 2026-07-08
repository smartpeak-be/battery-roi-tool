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
  applyDiscountToVatGroups,
  productPurchaseCostExVat,
  productCalculationReadiness,
  productConfigCalculationReadiness,
  normalizeProductConfigCustomerType,
  quoteGroupsProfitExVat,
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

  it('applies discounts to the composition VAT groups only', () => {
    const groups = applyDiscountToVatGroups([
      { vat: 21, items: [{ productId: 'acplus', qty: 1 }, { productId: 'install', qty: 1 }], extraExVat: 50 },
    ], { type: 'percent', value: 10 }, pMap);

    expect(groups[0].discountExVat).toBeCloseTo(150);
    expect(quoteGroupSubtotalExVat(groups[0], pMap)).toBeCloseTo(1350);
  });

  it('counts service product purchase price as cost when calculating quote profit', () => {
    const serviceProduct = {
      id: 'inspection',
      categoryId: 'cat-service',
      brand: 'SmartPeak',
      model: 'Keuring',
      purchasePrice: 150,
      marginType: 'fixed',
      marginValue: 100,
      specs: {},
    };
    const productsById = productMap([serviceProduct]);
    const groups = [{ vat: 21, items: [{ productId: 'inspection', qty: 1 }] }];

    expect(productPurchaseCostExVat(serviceProduct, 1)).toBeCloseTo(150);
    expect(quoteGroupsProfitExVat(groups, productsById)).toBeCloseTo(100);
  });

  it('prefers explicit service purchase cost when present', () => {
    const serviceProduct = {
      id: 'custom-service',
      categoryId: 'cat-service',
      brand: 'SmartPeak',
      model: 'Service',
      purchasePrice: 150,
      marginType: 'fixed',
      marginValue: 100,
      specs: { purchaseCostExVat: 120 },
    };

    expect(productPurchaseCostExVat(serviceProduct, 2)).toBeCloseTo(240);
  });

  it('caps fixed discounts at the composition total', () => {
    const groups = applyDiscountToVatGroups([
      { vat: 6, items: [], description: 'Extra installatiekost', extraExVat: 90 },
    ], { type: 'fixed', value: 150 }, pMap);

    expect(groups[0].discountExVat).toBeCloseTo(90);
    expect(quoteGroupSubtotalExVat(groups[0], pMap)).toBe(0);
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

  it('reports calculation readiness for product configs with readable field names', () => {
    const manualSystem = {
      id: 'manual-system',
      categoryId: 'cat-system',
      brand: '.',
      model: '.',
      description: 'Manueel nul product',
      specs: { selfHeating: false },
    };
    const productsById = productMap([...products, manualSystem]);
    const readiness = productConfigCalculationReadiness({
      id: 'blank',
      name: '0_BLANCO_MANUEEL',
      customerType: 'b2c',
      isActive: true,
      items: [
        { productId: 'install', qty: 1 },
        { productId: 'manual-system', qty: 1 },
      ],
    }, productsById, cMap);

    expect(readiness.eligible).toBe(false);
    expect(readiness.reasons).toContain('Manueel nul product: Nuttige capaciteit ontbreekt');
    expect(readiness.reasons).toContain('Manueel nul product: Nominaal AC-vermogen ontbreekt');
    expect(readiness.reasons).toContain('Geen totale nuttige batterijcapaciteit gevonden');
    expect(readiness.reasons).toContain('Geen totaal nominaal AC-vermogen gevonden');
  });

  it('marks calculation-critical product fields and treats efficiency as advisory', () => {
    const battery = {
      id: 'partial-battery',
      categoryId: 'cat-bat',
      brand: 'Zendure',
      model: 'AB3000X',
      specs: { capacityKwh: 2.88 },
    };
    const readiness = productCalculationReadiness(battery, cMap);

    expect(readiness.relevant).toBe(true);
    expect(readiness.blockingMissing).toEqual([]);
    expect(readiness.advisoryMissing).toEqual(['efficiency']);
    expect(readiness.messages).toContain('Rendement ontbreekt; calculator gebruikt 90% standaardrendement');
  });

  it('defaults blank new configs to B2C without requiring a config object', () => {
    expect(normalizeProductConfigCustomerType(undefined, null)).toBe('b2c');
    expect(normalizeProductConfigCustomerType(undefined, undefined)).toBe('b2c');
  });

  it('reports B2B configs as hidden from the default calculator dropdown', () => {
    const readiness = productConfigCalculationReadiness({
      id: 'b2b',
      name: 'ZMIX3000_B2B',
      customerType: 'b2b',
      isActive: true,
      items: [{ productId: 'acplus', qty: 1 }],
    }, pMap, cMap);

    expect(readiness.eligible).toBe(false);
    expect(readiness.reasons).toContain('B2B-samenstelling: calculator toont momenteel alleen B2C');
  });
});
