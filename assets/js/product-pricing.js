// assets/js/product-pricing.js
// Pure pricing helpers — ES module, no DOM dependencies.

/**
 * Calculate the sell price for a single unit of a product.
 * @param {Object} product
 * @param {number} product.purchasePrice - Aankoopprijs ex BTW
 * @param {'percent'|'fixed'} product.marginType
 * @param {number} product.marginValue - % or € amount
 * @returns {number} Sell price (ex BTW)
 */
export function sellPrice(product) {
  const pp = product.purchasePrice || 0;
  if (product.marginType === 'fixed') {
    return pp + (product.marginValue || 0);
  }
  // Default: percent
  return pp * (1 + (product.marginValue || 0) / 100);
}

/**
 * Calculate the unit price for unit number `n` (1-based).
 * Units below discountFromUnit pay full sellPrice.
 * Units >= discountFromUnit get the discount applied.
 * @param {Object} product
 * @param {number} n - 1-based unit number
 * @returns {number} Price for this unit (ex BTW)
 */
export function unitPrice(product, n) {
  const base = sellPrice(product);
  const from = product.discountFromUnit || 2;
  if (n < from) return base;
  if (product.discountType === 'fixed') {
    return base - (product.discountValue || 0);
  }
  // Default: percent
  return base * (1 - (product.discountValue || 0) / 100);
}

/**
 * Calculate total price for `qty` units of a product.
 * @param {Object} product
 * @param {number} qty
 * @returns {number} Total price (ex BTW)
 */
export function totalProductPrice(product, qty) {
  let total = 0;
  for (let i = 1; i <= qty; i++) {
    total += unitPrice(product, i);
  }
  return total;
}

/**
 * Calculate Bebat contribution for `qty` units of a product.
 * Always 21% BTW regardless of house age.
 * @param {Object} product - must have specs.weightKg
 * @param {number} qty
 * @param {number} bebatPricePerKg - €/kg from settings
 * @returns {number} Bebat contribution incl. 21% BTW
 */
export function bebatContribution(product, qty, bebatPricePerKg) {
  const weight = (product.specs && product.specs.weightKg) || 0;
  return qty * weight * (bebatPricePerKg || 0) * 1.21;
}

/**
 * Apply default pricing settings to a new product object.
 * @param {Object} settings - config/settings doc
 * @returns {Object} Pricing defaults to spread into a new product
 */
export function pricingDefaults(settings) {
  return {
    marginType:      settings.defaultMarginType || 'percent',
    marginValue:     settings.defaultMarginValue ?? 30,
    discountType:    settings.defaultDiscountType || 'percent',
    discountValue:   settings.defaultDiscountValue ?? 10,
    discountFromUnit: settings.defaultDiscountFromUnit ?? 2,
  };
}
