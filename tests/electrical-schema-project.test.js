import { describe, expect, it } from 'vitest';
import { drawingFromProject, recommendedBreakerAmperage } from '../assets/js/electrical-schema-project.js';

const categories = [
  { id: 'bat', slug: 'batterijen' },
  { id: 'inv', slug: 'omvormers' },
  { id: 'sys', slug: 'thuisbatterij-systemen' },
];
const products = [
  { id: 'b1', categoryId: 'bat', brand: 'Zendure', model: 'AB3000X', specs: { capacityKwh: 2.88, nominalVoltage: 51.2 } },
  { id: 'i1', categoryId: 'inv', brand: 'Zendure', model: 'SolarFlow 2400 AC', specs: { inverterPowerKw: 2.4, phases: '1' } },
];

function project() {
  return {
    id: 'project-1', projectName: 'Woning Test',
    electrical: { connectionType: '1x230', fuseRatingA: 40 },
    installedSolution: { items: [
      { productId: 'b1', kind: 'battery', label: 'Zendure AB3000X', quantity: 2, specs: products[0].specs },
      { productId: 'i1', kind: 'inverter', label: 'Zendure SolarFlow 2400 AC', quantity: 1, specs: products[1].specs },
    ] },
    serialNumbers: [
      { category: 'batterij', value: 'BAT-001' }, { category: 'batterij', value: 'BAT-002' },
      { category: 'omvormer', value: 'INV-001' },
    ],
  };
}

describe('projectgestuurd eendraadschema', () => {
  it.each([
    [2.4, '1x230', 16], [4.6, '1x230', 20], [5.0, '1x230', 25],
    [6.0, '1x230', 32], [9.0, '3x230', 25], [22, '3x400+N', 32],
  ])('sizes %.1f kW on %s to the next standard breaker %s A', (powerKw, connectionType, expected) => {
    expect(recommendedBreakerAmperage(powerKw, connectionType, 63)).toBe(expected);
  });

  it('creates a project-linked proposal from installed products with totals, voltage and serials', () => {
    const drawing = drawingFromProject(project(), { products, categories, configs: [] });
    expect(drawing).toMatchObject({ projectId: 'project-1', connectionType: '1x230', mainBreaker: { amperage: 40, poles: 2 }, differentials: [{ amperage: 40, poles: 2 }] });
    const endpoints = drawing.differentials[0].branches.map(branch => branch.endpoint);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({ type: 'hybrid-inverter', serialNumber: 'INV-001', powerKw: 2.4, capacityKwh: 5.76 });
    expect(endpoints[0].customProperties).toEqual(expect.arrayContaining([
      { key: 'U', value: '51.2 V DC' }, { key: 'E totaal', value: '5.76 kWh' },
      { key: 'Batterij SN 1', value: 'BAT-001' }, { key: 'Batterij SN 2', value: 'BAT-002' },
    ]));
    expect(drawing.differentials[0].branches[0].breaker.amperage).toBe(16);
  });

  it('falls back to the selected product configuration when no installed solution exists', () => {
    const p = project();
    p.installedSolution.items = [];
    p.lastCalcRun = { results: { configResults: [{ cfg: { productConfigId: 'cfg1' } }] } };
    const drawing = drawingFromProject(p, { products, categories, configs: [{ id: 'cfg1', items: [{ productId: 'b1', qty: 1 }, { productId: 'i1', qty: 1 }] }] });
    expect(drawing.differentials[0].branches.map(branch => branch.endpoint.type)).toEqual(['hybrid-inverter']);
  });
});
