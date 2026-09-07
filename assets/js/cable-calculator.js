export const SQRT3 = Math.sqrt(3);
export const STANDARD_SECTIONS_MM2 = Object.freeze([1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]);
export const VOLTAGE_DROP_REFERENCES = Object.freeze([1, 2, 3, 4, 5]);

export const MATERIALS = Object.freeze({
  copper: { label: 'Koper', rhoOhmMm2PerM: 0.0225 },
  aluminium: { label: 'Aluminium', rhoOhmMm2PerM: 0.036 },
});

export const SYSTEMS = Object.freeze({
  single230: { label: '1-fase 230 V', topology: 'single', voltage: 230, phaseCount: 1 },
  three230: { label: '3×230 V zonder nul', topology: 'three', voltage: 230, phaseCount: 3 },
  three400: { label: '3×400 V + N', topology: 'three', voltage: 400, phaseCount: 3 },
  'three400-single': { label: '1-fasige belasting op 3×400 V + N', topology: 'single', voltage: 230, phaseCount: 1 },
  dc: { label: 'DC', topology: 'dc', voltage: null, phaseCount: 1 },
  pv: { label: 'PV / solar DC', topology: 'dc', voltage: null, phaseCount: 1 },
});

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} moet groter dan nul zijn.`);
  return number;
}

function finiteOptionalPositive(value, label) {
  if (value == null || value === '') return null;
  return finitePositive(value, label);
}

function finiteNonnegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} mag niet negatief zijn.`);
  return number;
}

function normalizePowerFactor(system, value) {
  if (system.topology === 'dc') return 1;
  const powerFactor = value == null || value === '' ? 1 : Number(value);
  if (!Number.isFinite(powerFactor) || powerFactor < 0.5 || powerFactor > 1) {
    throw new TypeError('cosφ moet tussen 0,50 en 1,00 liggen.');
  }
  return powerFactor;
}

export function systemDefinition(systemType, voltageOverride) {
  const system = SYSTEMS[systemType];
  if (!system) throw new TypeError('Onbekend nettype.');
  const voltage = voltageOverride == null || voltageOverride === ''
    ? system.voltage
    : finitePositive(voltageOverride, 'Spanning');
  if (voltage == null) throw new TypeError('Geef een DC-spanning op.');
  return { ...system, key: systemType, voltage };
}

function materialDefinition(material = 'copper', rhoOverride) {
  const definition = MATERIALS[material];
  if (!definition) throw new TypeError('Onbekend geleidermateriaal.');
  return {
    ...definition,
    key: material,
    rhoOhmMm2PerM: rhoOverride == null || rhoOverride === ''
      ? definition.rhoOhmMm2PerM
      : finitePositive(rhoOverride, 'Soortelijke weerstand'),
  };
}

export function currentFromLoad({ systemType, voltage, inputType = 'kw', value, powerFactor = 1 }) {
  const system = systemDefinition(systemType, voltage);
  const pf = normalizePowerFactor(system, powerFactor);
  const load = finitePositive(value, inputType === 'a' ? 'Stroom' : 'Vermogen');
  if (inputType === 'a') return load;
  const apparentVA = inputType === 'kva' ? load * 1000 : (load * 1000) / pf;
  if (!['kw', 'kva'].includes(inputType)) throw new TypeError('Kies A, kW of kVA als invoer.');
  return apparentVA / ((system.topology === 'three' ? SQRT3 : 1) * system.voltage);
}

export function powerFromCurrent({ systemType, voltage, currentA, powerFactor = 1 }) {
  const system = systemDefinition(systemType, voltage);
  const current = finitePositive(currentA, 'Stroom');
  const pf = normalizePowerFactor(system, powerFactor);
  const factor = system.topology === 'three' ? SQRT3 : 1;
  return {
    activePowerKW: factor * system.voltage * current * pf / 1000,
    apparentPowerKVA: factor * system.voltage * current / 1000,
  };
}

function conductorProperties({ material = 'copper', sectionMm2, rhoOhmMm2PerM, cableProfile }) {
  const section = finitePositive(sectionMm2, 'Kabelsectie');
  const materialData = materialDefinition(material, rhoOhmMm2PerM);
  const resistanceOhmPerM = cableProfile?.resistanceOperatingTempOhmPerKm != null
    ? finitePositive(cableProfile.resistanceOperatingTempOhmPerKm, 'Kabelweerstand') / 1000
    : materialData.rhoOhmMm2PerM / section;
  const reactanceOhmPerM = cableProfile?.reactanceOhmPerKm != null
    ? finiteNonnegative(cableProfile.reactanceOhmPerKm, 'Kabelreactantie') / 1000
    : 0;
  return { section, materialData, resistanceOhmPerM, reactanceOhmPerM };
}

function dropFactor(system) {
  return system.topology === 'three' ? SQRT3 : 2;
}

function lossFactor(system) {
  return system.topology === 'three' ? 3 : 2;
}

function circuitResultLabel(circuitType) {
  if (circuitType === 'production') return 'Spanningsstijging';
  if (circuitType === 'bidirectional') return 'Spanningsverschil';
  return 'Spanningsval';
}

function c1011Applies(system, circuitType) {
  return system.topology !== 'dc' && ['production', 'bidirectional'].includes(circuitType);
}

export function calculateCable(input) {
  const system = systemDefinition(input.systemType, input.voltage);
  const currentA = currentFromLoad(input);
  const powerFactor = normalizePowerFactor(system, input.powerFactor);
  const lengthM = finitePositive(input.lengthM, 'Trajectlengte');
  const properties = conductorProperties(input);
  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor ** 2));
  const effectiveImpedanceOhmPerM = system.topology === 'dc'
    ? properties.resistanceOhmPerM
    : properties.resistanceOhmPerM * powerFactor + properties.reactanceOhmPerM * sinPhi;
  const voltageDropV = dropFactor(system) * lengthM * currentA * effectiveImpedanceOhmPerM;
  const voltageDropPercent = voltageDropV / system.voltage * 100;
  const cableLossW = lossFactor(system) * currentA ** 2 * properties.resistanceOhmPerM * lengthM;
  const powers = powerFromCurrent({ systemType: input.systemType, voltage: system.voltage, currentA, powerFactor });
  const transportedPowerW = powers.activePowerKW * 1000;
  const circuitType = input.circuitType || (input.systemType === 'pv' ? 'pv-string' : 'consumer');
  const isRise = circuitType === 'production';
  const endVoltageV = system.voltage + (isRise ? voltageDropV : -voltageDropV);
  const productionRuleApplies = c1011Applies(system, circuitType);
  const strictlyUnderOnePercent = voltageDropPercent < 1 - 1e-9;
  const thermalAmpacityA = finiteOptionalPositive(input.thermalAmpacityA, 'Thermische limiet');
  return {
    systemType: input.systemType,
    topology: system.topology,
    nominalVoltageV: system.voltage,
    currentA,
    ...powers,
    voltageDropV,
    voltageDropPercent,
    endVoltageV,
    cableLossW,
    cableLossPercent: transportedPowerW > 0 ? cableLossW / transportedPowerW * 100 : 0,
    sectionMm2: properties.section,
    lengthM,
    resistanceOhmPerM: properties.resistanceOhmPerM,
    rhoOhmMm2PerM: properties.materialData.rhoOhmMm2PerM,
    reactanceOhmPerM: properties.reactanceOhmPerM,
    circuitType,
    resultLabel: circuitResultLabel(circuitType),
    thermalAmpacityA,
    thermalWithinLimit: thermalAmpacityA == null ? null : currentA <= thermalAmpacityA,
    compliance: {
      under1Percent: strictlyUnderOnePercent,
      under2Percent: voltageDropPercent <= 2,
      under3Percent: voltageDropPercent <= 3,
      c1011VoltageRise: productionRuleApplies ? strictlyUnderOnePercent : null,
    },
  };
}

function theoreticalSection(input, targetPercent) {
  const system = systemDefinition(input.systemType, input.voltage);
  const currentA = currentFromLoad(input);
  const pf = normalizePowerFactor(system, input.powerFactor);
  const lengthM = finitePositive(input.lengthM, 'Trajectlengte');
  const target = finitePositive(targetPercent, 'Spanningsvalgrens');
  const material = materialDefinition(input.material, input.rhoOhmMm2PerM);
  const allowedDropV = system.voltage * target / 100;
  const xOhmPerM = input.cableProfile?.reactanceOhmPerKm
    ? finitePositive(input.cableProfile.reactanceOhmPerKm, 'Kabelreactantie') / 1000
    : 0;
  const sinPhi = Math.sqrt(Math.max(0, 1 - pf ** 2));
  const denominator = allowedDropV / (dropFactor(system) * lengthM * currentA) - xOhmPerM * sinPhi;
  if (denominator <= 0) return Infinity;
  return material.rhoOhmMm2PerM * (system.topology === 'dc' ? 1 : pf) / denominator;
}

function satisfiesDrop(result, target, strict) {
  return strict ? result.voltageDropPercent < target - 1e-9 : result.voltageDropPercent <= target;
}

export function selectCableSection(input) {
  const target = finitePositive(input.voltageDropTargetPercent, 'Spanningsvalgrens');
  const thermalAmpacityA = finiteOptionalPositive(input.thermalAmpacityA, 'Thermische limiet');
  const system = systemDefinition(input.systemType, input.voltage);
  const strict = c1011Applies(system, input.circuitType) && target === 1;
  const evaluations = STANDARD_SECTIONS_MM2.map(sectionMm2 => {
    const calculation = calculateCable({ ...input, sectionMm2 });
    const voltageOk = satisfiesDrop(calculation, target, strict);
    const thermalOk = thermalAmpacityA == null || calculation.currentA <= thermalAmpacityA;
    return { sectionMm2, voltageOk, thermalOk, accepted: voltageOk && thermalOk, calculation };
  });
  const selected = evaluations.find(entry => entry.accepted) || null;
  return {
    theoreticalSectionMm2: theoreticalSection(input, target),
    recommendedStandardSectionMm2: selected?.sectionMm2 ?? null,
    calculation: selected?.calculation ?? null,
    evaluations,
    voltageDropTargetPercent: target,
    strictLimit: strict,
    thermalAmpacityA,
  };
}

export function maxCurrentForDrop(input) {
  const system = systemDefinition(input.systemType, input.voltage);
  const target = finitePositive(input.voltageDropTargetPercent, 'Spanningsvalgrens');
  const lengthM = finitePositive(input.lengthM, 'Trajectlengte');
  const pf = normalizePowerFactor(system, input.powerFactor);
  const properties = conductorProperties(input);
  const sinPhi = Math.sqrt(Math.max(0, 1 - pf ** 2));
  const z = system.topology === 'dc'
    ? properties.resistanceOhmPerM
    : properties.resistanceOhmPerM * pf + properties.reactanceOhmPerM * sinPhi;
  const voltageDropLimitA = system.voltage * target / 100 / (dropFactor(system) * lengthM * z);
  const powers = powerFromCurrent({ systemType: input.systemType, voltage: system.voltage, currentA: voltageDropLimitA, powerFactor: pf });
  const thermalAmpacityA = finiteOptionalPositive(input.thermalAmpacityA, 'Thermische limiet');
  const strictLimit = c1011Applies(system, input.circuitType) && target === 1;
  return {
    voltageDropTargetPercent: target,
    strictLimit,
    voltageDropLimitA,
    maxActivePowerKW: powers.activePowerKW,
    maxApparentPowerKVA: powers.apparentPowerKVA,
    voltageDropV: system.voltage * target / 100,
    cableLossW: lossFactor(system) * voltageDropLimitA ** 2 * properties.resistanceOhmPerM * lengthM,
    thermalAmpacityA,
    finalAllowedCurrentA: thermalAmpacityA == null ? null : Math.min(voltageDropLimitA, thermalAmpacityA),
  };
}

export function maxDistanceForDrop(input) {
  const system = systemDefinition(input.systemType, input.voltage);
  const target = finitePositive(input.voltageDropTargetPercent, 'Spanningsvalgrens');
  const currentA = currentFromLoad(input);
  const pf = normalizePowerFactor(system, input.powerFactor);
  const properties = conductorProperties(input);
  const sinPhi = Math.sqrt(Math.max(0, 1 - pf ** 2));
  const z = system.topology === 'dc'
    ? properties.resistanceOhmPerM
    : properties.resistanceOhmPerM * pf + properties.reactanceOhmPerM * sinPhi;
  return {
    voltageDropTargetPercent: target,
    strictLimit: c1011Applies(system, input.circuitType) && target === 1,
    maxDistanceM: system.voltage * target / 100 / (dropFactor(system) * currentA * z),
    currentA,
  };
}

export function calculatePvArray(input) {
  const vmpPanelV = finitePositive(input.vmpPanelV, 'Vmp per paneel');
  const vocPanelV = finitePositive(input.vocPanelV, 'Voc per paneel');
  const impPanelA = finitePositive(input.impPanelA, 'Imp per paneel');
  const iscPanelA = finitePositive(input.iscPanelA, 'Isc per paneel');
  const panelsSeries = finitePositive(input.panelsSeries, 'Panelen in serie');
  const stringsParallel = finitePositive(input.stringsParallel, 'Parallelle strings');
  const vmpStringV = vmpPanelV * panelsSeries;
  const vocStringV = vocPanelV * panelsSeries;
  const impTotalA = impPanelA * stringsParallel;
  const iscTotalA = iscPanelA * stringsParallel;
  return { vmpStringV, vocStringV, impTotalA, iscTotalA, mppPowerKW: vmpStringV * impTotalA / 1000 };
}

export function comparisonForSections(input, sections = STANDARD_SECTIONS_MM2) {
  return sections.map(sectionMm2 => ({
    sectionMm2,
    calculation: calculateCable({ ...input, sectionMm2 }),
    limits: Object.fromEntries(VOLTAGE_DROP_REFERENCES.map(limit => [limit, maxCurrentForDrop({ ...input, sectionMm2, voltageDropTargetPercent: limit })])),
  }));
}
