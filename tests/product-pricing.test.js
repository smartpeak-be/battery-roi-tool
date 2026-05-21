// tests/product-pricing.test.js
import { describe, it, expect } from 'vitest';
import {
  sellPrice,
  unitPrice,
  totalProductPrice,
  bebatContribution,
  pricingDefaults,
} from '../assets/js/product-pricing.js';

// ─── sellPrice ─────────────────────────────────────────────

describe('sellPrice', () => {
  it('applies percent margin (30% on €1000 = €1300)', () => {
    const p = { purchasePrice: 1000, marginType: 'percent', marginValue: 30 };
    expect(sellPrice(p)).toBeCloseTo(1300);
  });

  it('applies fixed margin (€300 on €1000 = €1300)', () => {
    const p = { purchasePrice: 1000, marginType: 'fixed', marginValue: 300 };
    expect(sellPrice(p)).toBeCloseTo(1300);
  });

  it('handles 0% margin', () => {
    const p = { purchasePrice: 500, marginType: 'percent', marginValue: 0 };
    expect(sellPrice(p)).toBeCloseTo(500);
  });

  it('handles 0 fixed margin', () => {
    const p = { purchasePrice: 500, marginType: 'fixed', marginValue: 0 };
    expect(sellPrice(p)).toBeCloseTo(500);
  });

  it('allows zero purchase price with 0% margin', () => {
    const p = { purchasePrice: 0, marginType: 'percent', marginValue: 0 };
    expect(sellPrice(p)).toBeCloseTo(0);
  });

  it('allows zero purchase price with a fixed profit amount', () => {
    const p = { purchasePrice: 0, marginType: 'fixed', marginValue: 125 };
    expect(sellPrice(p)).toBeCloseTo(125);
  });

  it('handles missing purchasePrice', () => {
    const p = { marginType: 'percent', marginValue: 30 };
    expect(sellPrice(p)).toBe(0);
  });

  it('defaults to percent when marginType is missing', () => {
    const p = { purchasePrice: 1000, marginValue: 20 };
    expect(sellPrice(p)).toBeCloseTo(1200);
  });
});

// ─── unitPrice ─────────────────────────────────────────────

describe('unitPrice', () => {
  const base = {
    purchasePrice: 1000, marginType: 'percent', marginValue: 30,
    discountType: 'percent', discountValue: 10, discountFromUnit: 2,
  };

  it('unit 1 = full sell price (no discount)', () => {
    expect(unitPrice(base, 1)).toBeCloseTo(1300);
  });

  it('unit 2 = sell price minus 10% discount = €1170', () => {
    expect(unitPrice(base, 2)).toBeCloseTo(1170);
  });

  it('unit 5 = same discounted price', () => {
    expect(unitPrice(base, 5)).toBeCloseTo(1170);
  });

  it('fixed discount: unit 2 = sell price minus €200 = €1100', () => {
    const p = { ...base, discountType: 'fixed', discountValue: 200 };
    expect(unitPrice(p, 2)).toBeCloseTo(1100);
  });

  it('custom discountFromUnit: 3 → unit 2 = full price, unit 3 = discounted', () => {
    const p = { ...base, discountFromUnit: 3 };
    expect(unitPrice(p, 2)).toBeCloseTo(1300);
    expect(unitPrice(p, 3)).toBeCloseTo(1170);
  });

  it('0% discount = full price for all units', () => {
    const p = { ...base, discountValue: 0 };
    expect(unitPrice(p, 2)).toBeCloseTo(1300);
  });
});

// ─── totalProductPrice ─────────────────────────────────────

describe('totalProductPrice', () => {
  const base = {
    purchasePrice: 1000, marginType: 'percent', marginValue: 30,
    discountType: 'percent', discountValue: 10, discountFromUnit: 2,
  };

  it('qty 0 = €0', () => {
    expect(totalProductPrice(base, 0)).toBe(0);
  });

  it('qty 1 = €1300 (full price)', () => {
    expect(totalProductPrice(base, 1)).toBeCloseTo(1300);
  });

  it('qty 2 = €1300 + €1170 = €2470', () => {
    expect(totalProductPrice(base, 2)).toBeCloseTo(2470);
  });

  it('qty 5 = €1300 + 4 × €1170 = €5980', () => {
    expect(totalProductPrice(base, 5)).toBeCloseTo(5980);
  });
});

// ─── bebatContribution ─────────────────────────────────────

describe('bebatContribution', () => {
  it('calculates correctly with 21% BTW', () => {
    const p = { specs: { weightKg: 60 } };
    // 2 units × 60 kg × €0.50/kg × 1.21 = €72.60
    expect(bebatContribution(p, 2, 0.50)).toBeCloseTo(72.60);
  });

  it('returns 0 when weightKg is 0', () => {
    const p = { specs: { weightKg: 0 } };
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when weightKg is null', () => {
    const p = { specs: { weightKg: null } };
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when specs is missing', () => {
    const p = {};
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when bebatPricePerKg is 0', () => {
    const p = { specs: { weightKg: 60 } };
    expect(bebatContribution(p, 2, 0)).toBe(0);
  });

  it('qty 1 × 26.1 kg × €0.42/kg × 1.21 = €13.27', () => {
    const p = { specs: { weightKg: 26.1 } };
    expect(bebatContribution(p, 1, 0.42)).toBeCloseTo(26.1 * 0.42 * 1.21);
  });
});

// ─── pricingDefaults ───────────────────────────────────────

describe('pricingDefaults', () => {
  it('extracts defaults from settings', () => {
    const settings = {
      defaultMarginType: 'percent',
      defaultMarginValue: 30,
      defaultDiscountType: 'fixed',
      defaultDiscountValue: 150,
      defaultDiscountFromUnit: 3,
    };
    expect(pricingDefaults(settings)).toEqual({
      marginType: 'percent',
      marginValue: 30,
      discountType: 'fixed',
      discountValue: 150,
      discountFromUnit: 3,
    });
  });

  it('falls back to sensible defaults when settings are empty', () => {
    expect(pricingDefaults({})).toEqual({
      marginType: 'percent',
      marginValue: 30,
      discountType: 'percent',
      discountValue: 10,
      discountFromUnit: 2,
    });
  });
});
