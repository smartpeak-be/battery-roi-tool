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
  { id: 'plug1', categoryId: 'bat', brand: 'Marstek', model: 'Venus E', specs: { capacityKwh: 5.12, nominalVoltage: 51.2, inverterPowerKw: 2.5 } },
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
    expect(endpoints[0].label).toBe('Zendure SolarFlow 2400 AC');
    expect(endpoints[0].customProperties.some(property => property.key === 'Bron')).toBe(false);
    expect(endpoints[0].customProperties).toEqual(expect.arrayContaining([
      { key: 'U', value: '51.2 V DC' }, { key: 'E totaal', value: '5.76 kWh' },
      { key: 'Batterijen', value: '2x Zendure AB3000X' },
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

  it('creates one branch per inverter and distributes batteries as evenly as possible', () => {
    const p = project();
    p.installedSolution.items = [
      { productId: 'i1', kind: 'inverter', quantity: 2, specs: products[1].specs },
      { productId: 'b1', kind: 'battery', quantity: 5, specs: products[0].specs },
    ];
    p.serialNumbers = [
      { category: 'omvormer', value: 'INV-1' }, { category: 'omvormer', value: 'INV-2' },
      ...Array.from({ length: 5 }, (_, index) => ({ category: 'batterij', value: `BAT-${index + 1}` })),
    ];
    const branches = drawingFromProject(p, { products, categories, configs: [] }).differentials[0].branches;
    expect(branches).toHaveLength(2);
    expect(branches.map(branch => branch.endpoint.serialNumber)).toEqual(['INV-1', 'INV-2']);
    expect(branches.map(branch => branch.endpoint.capacityKwh)).toEqual([8.64, 5.76]);
    expect(branches.map(branch => branch.endpoint.customProperties.filter(prop => prop.key.startsWith('Batterij SN')).length)).toEqual([3, 2]);
  });

  it('uses existing project inverters when the installed solution only adds battery modules', () => {
    const p = project();
    p.installedSolution.items = [{ productId: 'b1', kind: 'battery', quantity: 4, specs: products[0].specs }];
    p.solar = { inverters: [{ brand: 'Huawei', model: 'SUN2000', powerKw: 5 }, { brand: 'Huawei', model: 'SUN2000', powerKw: 5 }] };
    const branches = drawingFromProject(p, { products, categories, configs: [] }).differentials[0].branches;
    expect(branches).toHaveLength(2);
    expect(branches.map(branch => branch.endpoint.capacityKwh)).toEqual([5.76, 5.76]);
    expect(branches.every(branch => branch.endpoint.model === 'SUN2000')).toBe(true);
  });

  it('keeps battery-only projects editable when existing inverter details are missing', () => {
    const p = project();
    p.installedSolution.items = [{ productId: 'b1', kind: 'battery', quantity: 2, specs: products[0].specs }];
    p.solar = { inverters: [] };
    const branches = drawingFromProject(p, { products, categories, configs: [] }).differentials[0].branches;
    expect(branches).toHaveLength(1);
    expect(branches[0].endpoint.label).toContain('Bestaande omvormer');
    expect(branches[0].endpoint.customProperties).toContainEqual({ key: 'Controle', value: 'Omvormervermogen en automaat nazien' });
  });

  it('keeps batteries with their own AC inverter as independent plug-in branches', () => {
    const p = project();
    p.installedSolution.items = [
      { productId: 'i1', kind: 'inverter', quantity: 1, specs: products[1].specs },
      { productId: 'b1', kind: 'battery', quantity: 2, specs: products[0].specs },
      { productId: 'plug1', kind: 'battery', quantity: 1, specs: products[2].specs },
    ];
    const branches = drawingFromProject(p, { products, categories, configs: [] }).differentials[0].branches;
    expect(branches).toHaveLength(2);
    expect(branches.map(branch => branch.endpoint.model)).toEqual(['SolarFlow 2400 AC', 'Venus E']);
  });
});
