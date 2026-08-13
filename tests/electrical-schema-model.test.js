import { describe, expect, it } from 'vitest';
import {
  addBranch,
  addDifferential,
  createEmptyDrawing,
  deleteElement,
  findElement,
  normalizeDrawing,
  updateElement,
} from '../assets/js/electrical-schema-model.js';

describe('eendraadschema model v2', () => {
  it('starts with the main breaker as first element in the chain', () => {
    expect(createEmptyDrawing({ projectId: 'project-1' })).toMatchObject({
      version: 2,
      projectId: 'project-1',
      mainBreaker: { type: 'main-breaker', label: 'Hoofdautomaat', amperage: 40, poles: 4 },
      differentials: [],
    });
  });

  it('supports nested differentials', () => {
    let drawing = addDifferential(createEmptyDrawing(), null, { id: 'd1', label: 'Hoofddifferentieel' });
    drawing = addDifferential(drawing, 'd1', { id: 'd2', label: 'Differentieel batterij' });
    expect(drawing.differentials[0].differentials[0]).toMatchObject({ id: 'd2', label: 'Differentieel batterij' });
    expect(findElement(drawing, 'd2')).toMatchObject({ type: 'differential', parentId: 'd1' });
  });

  it.each(['circuit', 'battery', 'inverter', 'hybrid-inverter'])('adds a protected %s branch under a differential', endpointType => {
    let drawing = addDifferential(createEmptyDrawing(), null, { id: 'd1' });
    drawing = addBranch(drawing, 'd1', endpointType, {
      id: `branch-${endpointType}`,
      breaker: { id: `breaker-${endpointType}` },
      endpoint: { id: `endpoint-${endpointType}` },
    });
    expect(drawing.differentials[0].branches[0]).toMatchObject({
      type: 'branch',
      endpoint: { type: endpointType },
      breaker: { type: 'breaker' },
    });
  });

  it('migrates the v1 differential → breaker → circuit shape', () => {
    const migrated = normalizeDrawing({
      version: 1,
      differentials: [{ id: 'd', breakers: [{ id: 'b', label: 'Batterij', circuits: [{ id: 'c', label: 'Kring batterij' }] }] }],
    });
    expect(migrated.version).toBe(2);
    expect(migrated.mainBreaker.type).toBe('main-breaker');
    expect(migrated.differentials[0].branches[0]).toMatchObject({
      breaker: { id: 'b', label: 'Batterij' },
      endpoint: { id: 'c', type: 'circuit', label: 'Kring batterij' },
    });
  });

  it('updates and recursively deletes nested elements', () => {
    let drawing = addDifferential(createEmptyDrawing(), null, { id: 'd1' });
    drawing = addDifferential(drawing, 'd1', { id: 'd2' });
    drawing = addBranch(drawing, 'd2', 'battery', { id: 'branch', endpoint: { id: 'device' } });
    drawing = updateElement(drawing, 'device', { brand: 'Zendure', model: 'SolarFlow' });
    expect(findElement(drawing, 'device').element).toMatchObject({ brand: 'Zendure', model: 'SolarFlow' });
    expect(findElement(deleteElement(drawing, 'd2'), 'device')).toBeNull();
  });
});
