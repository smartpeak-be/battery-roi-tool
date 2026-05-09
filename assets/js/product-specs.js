// assets/js/product-specs.js
// Spec field definitions per product category.

/**
 * Named spec fields with type, unit, and label.
 * Each field knows which category slugs it belongs to.
 */
export const SPEC_FIELDS = [
  // Battery-specific
  { key: 'capacityKwh',        label: 'Nuttige capaciteit',  unit: 'kWh',   type: 'number', categories: ['batterijen'] },
  { key: 'nominalVoltage',     label: 'Nominale spanning',   unit: 'V DC',  type: 'number', categories: ['batterijen'] },
  { key: 'chemistry',          label: 'Cel-chemie',          unit: '',      type: 'select', options: ['LiFePO4', 'NMC', 'LTO'], categories: ['batterijen'] },
  { key: 'cycleLife',          label: 'Cycli',               unit: 'cycli', type: 'number', categories: ['batterijen'] },
  { key: 'maxChargePowerW',    label: 'Max laadvermogen',    unit: 'W',     type: 'number', categories: ['batterijen'] },
  { key: 'maxDischargePowerW', label: 'Max ontlaadvermogen', unit: 'W',     type: 'number', categories: ['batterijen'] },
  { key: 'depthOfDischarge',   label: 'DoD',                 unit: '%',     type: 'number', categories: ['batterijen'] },
  { key: 'selfHeating',        label: 'Vorstbescherming',    unit: '',      type: 'boolean', categories: ['batterijen'] },

  // Inverter-specific
  { key: 'inverterPowerKw',    label: 'Nominaal AC-vermogen', unit: 'kW',  type: 'number', categories: ['omvormers'] },
  { key: 'peakPowerKw',        label: 'Piekvermogen',         unit: 'kW',  type: 'number', categories: ['omvormers'] },
  { key: 'maxAcInputKw',       label: 'Max AC input',         unit: 'kW',  type: 'number', categories: ['omvormers'] },
  { key: 'maxPvInputKw',       label: 'Max PV input',         unit: 'kW',  type: 'number', categories: ['omvormers'] },
  { key: 'mpptCount',          label: 'MPPT-trackers',        unit: '',    type: 'number', categories: ['omvormers'] },
  { key: 'phases',             label: 'Fasen',                unit: '',    type: 'select', options: ['1', '3'], categories: ['omvormers'] },

  // Shared: batterijen + omvormers
  { key: 'efficiency',         label: 'Rendement',           unit: '%',    type: 'number', categories: ['batterijen', 'omvormers'] },

  // Shared: all three categories
  { key: 'weightKg',           label: 'Gewicht',             unit: 'kg',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'heightMm',           label: 'Hoogte',              unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'widthMm',            label: 'Breedte',             unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'depthMm',            label: 'Diepte',              unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },

  // Shared: batterijen + omvormers only
  { key: 'ipRating',           label: 'IP-bescherming',      unit: '',     type: 'text',   categories: ['batterijen', 'omvormers'] },
  { key: 'operatingTempMin',   label: 'Bedrijfstemp. min',   unit: '\u00b0C',  type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'operatingTempMax',   label: 'Bedrijfstemp. max',   unit: '\u00b0C',  type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'connectivity',       label: 'Connectiviteit',      unit: '',     type: 'text',   categories: ['batterijen', 'omvormers'] },
  { key: 'warrantyYears',      label: 'Garantie',            unit: 'jaar', type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'mountType',          label: 'Montage',             unit: '',     type: 'select', options: ['Muur', 'Vloer', 'Rack'], categories: ['batterijen', 'omvormers'] },
  { key: 'noiseLevel',         label: 'Geluidsniveau',       unit: 'dB',   type: 'number', categories: ['batterijen', 'omvormers'] },
];

/**
 * Get spec fields visible for a given category slug.
 * Unknown categories get no fields (empty array).
 * @param {string} categorySlug
 * @returns {Array}
 */
export function specsForCategory(categorySlug) {
  const slug = (categorySlug || '').toLowerCase();
  return SPEC_FIELDS.filter(f => f.categories.includes(slug));
}
