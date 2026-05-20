// assets/js/product-specs.js
// Spec field definitions per product category.

/**
 * Named spec fields with type, unit, and label.
 * Each field knows which category slugs it belongs to.
 */
export const SPEC_FIELDS = [
  // Battery-specific (also on thuisbatterij-systemen since those have a built-in battery)
  { key: 'capacityKwh',        label: 'Nuttige capaciteit',  unit: 'kWh',   type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'nominalVoltage',     label: 'Nominale spanning',   unit: 'V DC',  type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'chemistry',          label: 'Cel-chemie',          unit: '',      type: 'select', options: ['LiFePO4', 'NMC', 'LTO'], categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'cycleLife',          label: 'Cycli',               unit: 'cycli', type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'maxChargePowerW',    label: 'Max laadvermogen',    unit: 'W',     type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'maxDischargePowerW', label: 'Max ontlaadvermogen', unit: 'W',     type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'depthOfDischarge',   label: 'DoD',                 unit: '%',     type: 'number', categories: ['batterijen', 'thuisbatterij-systemen'] },
  { key: 'selfHeating',        label: 'Vorstbescherming',    unit: '',      type: 'boolean', categories: ['batterijen', 'thuisbatterij-systemen'] },

  // Inverter-specific (also on thuisbatterij-systemen since those have a built-in inverter)
  { key: 'inverterPowerKw',    label: 'Nominaal AC-vermogen', unit: 'kW',  type: 'number', categories: ['omvormers', 'thuisbatterij-systemen'] },
  { key: 'peakPowerKw',        label: 'Piekvermogen',         unit: 'kW',  type: 'number', categories: ['omvormers', 'thuisbatterij-systemen'] },
  { key: 'maxAcInputKw',       label: 'Max AC input',         unit: 'kW',  type: 'number', categories: ['omvormers', 'thuisbatterij-systemen'] },
  { key: 'maxPvInputKw',       label: 'Max PV input',         unit: 'kW',  type: 'number', categories: ['omvormers'] },
  { key: 'mpptCount',          label: 'MPPT-trackers',        unit: '',    type: 'number', categories: ['omvormers'] },
  { key: 'phases',             label: 'Fasen',                unit: '',    type: 'select', options: ['1', '3'], categories: ['omvormers'] },

  // Shared: batterijen + omvormers + thuisbatterij-systemen
  { key: 'efficiency',         label: 'Rendement',           unit: '%',    type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },

  // Shared: all categories with physical products
  { key: 'weightKg',           label: 'Gewicht',             unit: 'kg',   type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen', 'materiaal'] },
  { key: 'heightMm',           label: 'Hoogte',              unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen', 'materiaal'] },
  { key: 'widthMm',            label: 'Breedte',             unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen', 'materiaal'] },
  { key: 'depthMm',            label: 'Diepte',              unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen', 'materiaal'] },

  // Service products used by quote/invoice composition
  { key: 'serviceKey',          label: 'Service-type',        unit: '',     type: 'select', options: ['installation', 'inspection', 'buffer'], categories: ['service'] },

  // Shared: batterijen + omvormers + thuisbatterij-systemen
  { key: 'ipRating',           label: 'IP-bescherming',      unit: '',     type: 'text',   categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'operatingTempMin',   label: 'Bedrijfstemp. min',   unit: '\u00b0C',  type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'operatingTempMax',   label: 'Bedrijfstemp. max',   unit: '\u00b0C',  type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'connectivity',       label: 'Connectiviteit',      unit: '',     type: 'text',   categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'warrantyYears',      label: 'Garantie',            unit: 'jaar', type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'mountType',          label: 'Montage',             unit: '',     type: 'select', options: ['Muur', 'Vloer', 'Rack'], categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
  { key: 'noiseLevel',         label: 'Geluidsniveau',       unit: 'dB',   type: 'number', categories: ['batterijen', 'omvormers', 'thuisbatterij-systemen'] },
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
