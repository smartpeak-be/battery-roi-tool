import { describe, expect, it } from 'vitest';
import {
  STANDARD_SECTIONS_MM2,
  VOLTAGE_DROP_REFERENCES,
  calculateCable,
  calculatePvArray,
  conservativeCurrentLimitA,
  currentFromLoad,
  maxDistanceForDrop,
  maxCurrentForDrop,
  selectCableSection,
} from '../assets/js/cable-calculator.js';

const close = (actual, expected, precision = 6) => expect(actual).toBeCloseTo(expected, precision);

describe('cable calculator current conversion', () => {
  it('uses 230 V as line voltage for balanced Belgian 3x230', () => {
    close(currentFromLoad({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1 }), 25.1021856169);
  });

  it('uses 400 V line voltage for balanced 3x400', () => {
    close(currentFromLoad({ systemType: 'three400', inputType: 'kw', value: 10, powerFactor: 1 }), 14.4337567297);
  });

  it('uses 230 V and single-phase formulas for a phase-neutral load on 3x400+N', () => {
    close(currentFromLoad({ systemType: 'three400-single', inputType: 'kw', value: 4.6, powerFactor: 1 }), 20);
  });

  it('converts kVA without applying power factor', () => {
    close(currentFromLoad({ systemType: 'three400', inputType: 'kva', value: 10, powerFactor: 0.8 }), 14.4337567297);
  });
});

describe('cable calculator', () => {
  it('supports compact comparisons from 1 through 5 percent', () => {
    expect(VOLTAGE_DROP_REFERENCES).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses a conservative common-copper current ceiling when no Iz is supplied', () => {
    expect(conservativeCurrentLimitA({ sectionMm2: 2.5, material: 'copper', systemType: 'three400' })).toBe(20);
    expect(conservativeCurrentLimitA({ sectionMm2: 6, material: 'copper', systemType: 'three400' })).toBe(40);
    expect(conservativeCurrentLimitA({ sectionMm2: 2.5, material: 'aluminium', systemType: 'three400' })).toBeNull();
    expect(conservativeCurrentLimitA({ sectionMm2: 2.5, material: 'copper', systemType: 'pv' })).toBeNull();
  });

  it('marks 40 A through 2.5 mm² red even when the route is short', () => {
    const result = calculateCable({ systemType: 'three400', inputType: 'a', value: 40, lengthM: 1, sectionMm2: 2.5, material: 'copper' });
    expect(result.voltageDropPercent).toBeLessThan(1);
    expect(result.thermalAmpacityA).toBe(20);
    expect(result.thermalWithinLimit).toBe(false);
    expect(result.thermalLimitSource).toBe('conservative-common-copper');
  });

  it('steps up the required section on the conservative current ceiling', () => {
    const result = selectCableSection({ systemType: 'three400', inputType: 'a', value: 40, lengthM: 1, material: 'copper', circuitType: 'consumer', voltageDropTargetPercent: 5 });
    expect(result.recommendedStandardSectionMm2).toBe(6);
  });
  it('calculates three-phase voltage drop and resistive loss', () => {
    const result = calculateCable({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1, lengthM: 45, sectionMm2: 6, material: 'copper' });
    close(result.currentA, 25.1021856169);
    close(result.voltageDropV, 7.3369565217);
    close(result.voltageDropPercent, 3.1899810964);
    close(result.cableLossW, 318.9981096408);
    close(result.endVoltageV, 222.6630434783);
  });

  it('automatically counts outward and return conductors for single phase', () => {
    const result = calculateCable({ systemType: 'single230', inputType: 'a', value: 20, powerFactor: 1, lengthM: 30, sectionMm2: 6, material: 'copper' });
    close(result.voltageDropV, 4.5);
    close(result.voltageDropPercent, 1.9565217391);
    close(result.cableLossW, 90);
  });

  it('uses the same two-conductor loop rule for DC', () => {
    const result = calculateCable({ systemType: 'dc', voltage: 600, inputType: 'a', value: 10, lengthM: 30, sectionMm2: 6, material: 'copper' });
    close(result.voltageDropV, 2.25);
    close(result.voltageDropPercent, 0.375);
    close(result.cableLossW, 22.5);
  });

  it('accepts zero reactance in the simple calculation profile', () => {
    const result = calculateCable({ systemType: 'three400', inputType: 'kw', value: 10, lengthM: 30, sectionMm2: 6, material: 'copper', cableProfile: { reactanceOhmPerKm: 0 } });
    expect(result.reactanceOhmPerM).toBe(0);
    expect(result.voltageDropV).toBeGreaterThan(0);
  });

  it('reports voltage rise for production and uses a strict C10/11 comparison', () => {
    const justBelow = calculateCable({ systemType: 'single230', inputType: 'a', value: 10, lengthM: 10, sectionMm2: 2, material: 'copper', circuitType: 'production' });
    expect(justBelow.resultLabel).toBe('Spanningsstijging');
    expect(justBelow.endVoltageV).toBeGreaterThan(230);
    expect(justBelow.compliance.c1011VoltageRise).toBe(true);

    const exactlyOne = calculateCable({ systemType: 'single230', inputType: 'a', value: 10, lengthM: 10, sectionMm2: 1.9565217391304348, material: 'copper', circuitType: 'production' });
    close(exactlyOne.voltageDropPercent, 1);
    expect(exactlyOne.compliance.c1011VoltageRise).toBe(false);
  });

  it('keeps 3 percent as a design reference, not a legal compliance result', () => {
    const result = calculateCable({ systemType: 'single230', inputType: 'a', value: 20, lengthM: 30, sectionMm2: 4, material: 'copper' });
    expect(result.compliance).toMatchObject({ under1Percent: false, under2Percent: false, under3Percent: true });
    expect(result.compliance).not.toHaveProperty('areiThreePercent');
  });

  it('does not apply the AC production C10/11 rule to DC battery or PV cabling', () => {
    const result = calculateCable({ systemType: 'dc', voltage: 600, inputType: 'a', value: 10, lengthM: 30, sectionMm2: 6, circuitType: 'bidirectional' });
    expect(result.compliance.c1011VoltageRise).toBeNull();
  });
});

describe('inverse calculations and section selection', () => {
  it('selects the first standard section satisfying each requested limit', () => {
    const one = selectCableSection({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1, lengthM: 45, material: 'copper', voltageDropTargetPercent: 1 });
    const two = selectCableSection({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1, lengthM: 45, material: 'copper', voltageDropTargetPercent: 2 });
    const three = selectCableSection({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1, lengthM: 45, material: 'copper', voltageDropTargetPercent: 3 });
    close(one.theoreticalSectionMm2, 19.1398865784);
    expect(one.recommendedStandardSectionMm2).toBe(25);
    expect(two.recommendedStandardSectionMm2).toBe(10);
    expect(three.recommendedStandardSectionMm2).toBe(10);
  });

  it('steps up when a production section lands on exactly 1.00 percent', () => {
    const selection = selectCableSection({ systemType: 'single230', inputType: 'a', value: 7.666666666666668, lengthM: 10, material: 'copper', circuitType: 'production', voltageDropTargetPercent: 1 });
    expect(selection.recommendedStandardSectionMm2).toBe(2.5);
    expect(selection.strictLimit).toBe(true);
  });

  it('combines the conservative current ceiling with an explicit Iz override', () => {
    const voltageOnly = maxCurrentForDrop({ systemType: 'three400', voltageDropTargetPercent: 1, lengthM: 45, sectionMm2: 6, material: 'copper' });
    expect(voltageOnly.thermalAmpacityA).toBe(40);
    expect(voltageOnly.finalAllowedCurrentA).toBeLessThanOrEqual(40);
    expect(voltageOnly.thermalLimitSource).toBe('conservative-common-copper');
    expect(voltageOnly.voltageDropLimitA).toBeGreaterThan(0);

    const strictProduction = maxCurrentForDrop({ systemType: 'three400', circuitType: 'production', voltageDropTargetPercent: 1, lengthM: 45, sectionMm2: 6, material: 'copper' });
    expect(strictProduction.strictLimit).toBe(true);

    const withIz = maxCurrentForDrop({ systemType: 'three400', voltageDropTargetPercent: 3, lengthM: 45, sectionMm2: 6, material: 'copper', thermalAmpacityA: 20 });
    expect(withIz.finalAllowedCurrentA).toBe(20);
  });

  it('calculates maximum one-way trajectory length', () => {
    close(maxDistanceForDrop({ systemType: 'three230', inputType: 'kw', value: 10, powerFactor: 1, sectionMm2: 6, material: 'copper', voltageDropTargetPercent: 1 }).maxDistanceM, 14.1066666667);
  });

  it('contains the agreed standard cable series', () => {
    expect(STANDARD_SECTIONS_MM2).toEqual([1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]);
  });
});

describe('PV array helper', () => {
  it('combines series voltage and parallel current without using Imp as thermal proof', () => {
    expect(calculatePvArray({ vmpPanelV: 40, vocPanelV: 48, impPanelA: 10, iscPanelA: 10.8, panelsSeries: 12, stringsParallel: 2 })).toEqual({
      vmpStringV: 480,
      vocStringV: 576,
      impTotalA: 20,
      iscTotalA: 21.6,
      mppPowerKW: 9.6,
    });
  });
});

describe('validation', () => {
  it.each([
    { systemType: 'three230', inputType: 'kw', value: 0, lengthM: 10, sectionMm2: 6 },
    { systemType: 'dc', voltage: -10, inputType: 'a', value: 10, lengthM: 10, sectionMm2: 6 },
    { systemType: 'single230', inputType: 'kw', value: 10, powerFactor: 1.2, lengthM: 10, sectionMm2: 6 },
  ])('rejects invalid numeric input %#', args => {
    expect(() => calculateCable(args)).toThrow();
  });
});
