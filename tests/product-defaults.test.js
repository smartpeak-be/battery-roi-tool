import { describe, expect, it } from 'vitest';
import { productPricingDefaults } from '../assets/js/producten-beheer/defaults.js';

describe('productPricingDefaults', () => {
  it('uses config defaults when creating a new product', () => {
    expect(productPricingDefaults(null, {
      defaultMarginType: 'fixed',
      defaultMarginValue: 30,
      defaultDiscountType: 'percent',
      defaultDiscountValue: 2.5,
      defaultDiscountFromUnit: 4,
    })).toEqual({
      marginType: 'fixed',
      marginValue: 30,
      discountType: 'percent',
      discountValue: 2.5,
      discountFromUnit: 4,
    });
  });

  it('keeps existing product values instead of replacing them with settings', () => {
    expect(productPricingDefaults({
      marginType: 'percent',
      marginValue: 12,
      discountType: 'fixed',
      discountValue: 7,
      discountFromUnit: 3,
    }, {
      defaultMarginType: 'fixed',
      defaultMarginValue: 30,
      defaultDiscountType: 'percent',
      defaultDiscountValue: 2.5,
      defaultDiscountFromUnit: 4,
    })).toEqual({
      marginType: 'percent',
      marginValue: 12,
      discountType: 'fixed',
      discountValue: 7,
      discountFromUnit: 3,
    });
  });
});
