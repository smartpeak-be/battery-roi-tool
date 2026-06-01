export function productPricingDefaults(product, settings = {}) {
  const p = product || {};
  return {
    marginType: p.marginType || settings.defaultMarginType || 'percent',
    marginValue: p.marginValue ?? settings.defaultMarginValue ?? 30,
    discountType: p.discountType || settings.defaultDiscountType || 'percent',
    discountValue: p.discountValue ?? settings.defaultDiscountValue ?? 10,
    discountFromUnit: p.discountFromUnit ?? settings.defaultDiscountFromUnit ?? 2,
  };
}
