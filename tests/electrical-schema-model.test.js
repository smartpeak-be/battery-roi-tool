import { describe, expect, it } from 'vitest';
import {
  addBranch,
  addDifferential,
  addRemCircuit,
  createEmptyDrawing,
  deleteElement,
  findElement,
  moveElement,
  normalizeDrawing,
  updateElement,
} from '../assets/js/electrical-schema-model.js';

describe('eendraadschema model v3', () => {
  it('starts with the main breaker as first element in the chain', () => {
    expect(createEmptyDrawing({ projectId: 'project-1' })).toMatchObject({
      version: 3,
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

  it.each(['circuit', 'battery', 'inverter', 'hybrid-inverter', 'rem-breaker'])('adds a protected %s branch under a differential', endpointType => {
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

  it('lets a REM distribution breaker contain ordinary circuits only', () => {
    let drawing = addDifferential(createEmptyDrawing(), null, { id: 'd1' });
    drawing = addBranch(drawing, 'd1', 'rem-breaker', {
      id: 'rem-branch', endpoint: { id: 'rem', label: 'REM automaat' },
    });
    drawing = addRemCircuit(drawing, 'rem', {
      id: 'child-branch',
      breaker: { id: 'child-breaker', amperage: 16 },
      endpoint: { id: 'child-circuit', label: 'Stopcontacten keuken' },
    });

    expect(findElement(drawing, 'rem').element.circuits[0]).toMatchObject({
      type: 'branch',
      breaker: { id: 'child-breaker', type: 'breaker' },
      endpoint: { id: 'child-circuit', type: 'circuit', label: 'Stopcontacten keuken' },
    });
    expect(findElement(drawing, 'child-circuit')).toMatchObject({ type: 'circuit', parentId: 'rem', branchId: 'child-branch' });
  });

  it('normalizes REM children to ordinary circuits even when malformed device data is loaded', () => {
    const normalized = normalizeDrawing({
      differentials: [{ id: 'd1', branches: [{
        endpoint: { id: 'rem', type: 'rem-breaker', circuits: [{ endpoint: { type: 'battery', label: 'Foute batterij' } }] },
      }] }],
    });
    expect(normalized.differentials[0].branches[0].endpoint.circuits[0].endpoint.type).toBe('circuit');
  });

  it('migrates the v1 differential → breaker → circuit shape', () => {
    const migrated = normalizeDrawing({
      version: 1,
      differentials: [{ id: 'd', breakers: [{ id: 'b', label: 'Batterij', circuits: [{ id: 'c', label: 'Kring batterij' }] }] }],
    });
    expect(migrated.version).toBe(3);
    expect(migrated.mainBreaker.type).toBe('main-breaker');
    expect(migrated.differentials[0].branches[0]).toMatchObject({
      breaker: { id: 'b', label: 'Batterij' },
      endpoint: { id: 'c', type: 'circuit', label: 'Kring batterij' },
    });
  });

  it('updates, reorders and recursively deletes REM children', () => {
    let drawing = addDifferential(createEmptyDrawing(), null, { id: 'd1' });
    drawing = addBranch(drawing, 'd1', 'rem-breaker', { id: 'rem-branch', endpoint: { id: 'rem' } });
    drawing = addRemCircuit(drawing, 'rem', { id: 'child-1', endpoint: { id: 'first', label: 'Eerste' } });
    drawing = addRemCircuit(drawing, 'rem', { id: 'child-2', endpoint: { id: 'second', label: 'Tweede' } });
    drawing = updateElement(drawing, 'first', { label: 'Verlichting' });
    drawing = moveElement(drawing, 'second', -1);
    expect(findElement(drawing, 'first').element.label).toBe('Verlichting');
    expect(findElement(drawing, 'rem').element.circuits.map(child => child.endpoint.id)).toEqual(['second', 'first']);
    expect(findElement(deleteElement(drawing, 'rem'), 'first')).toBeNull();
  });
});
