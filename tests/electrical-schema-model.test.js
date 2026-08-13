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

describe('eendraadschema model v4', () => {
  it('starts with main breaker followed by exactly one main differential', () => {
    const drawing = createEmptyDrawing({ projectId: 'project-1' });
    expect(drawing).toMatchObject({
      version: 4,
      projectId: 'project-1',
      mainBreaker: { type: 'main-breaker', label: 'Hoofdautomaat' },
      differentials: [{ type: 'differential', label: 'Hoofddifferentieel', sensitivityMa: 300 }],
    });
    expect(drawing.differentials).toHaveLength(1);
  });

  it('never adds a parallel root differential', () => {
    const drawing = createEmptyDrawing();
    const unchanged = addDifferential(drawing, null, { id: 'parallel' });
    expect(unchanged.differentials).toHaveLength(1);
    expect(findElement(unchanged, 'parallel')).toBeNull();
  });

  it('supports one downstream differential in series under the main differential', () => {
    const drawing = createEmptyDrawing();
    const rootId = drawing.differentials[0].id;
    const updated = addDifferential(drawing, rootId, { id: 'd2', label: 'Differentieel batterij' });
    expect(updated.differentials[0].differentials[0]).toMatchObject({ id: 'd2', label: 'Differentieel batterij' });
    const noParallel = addDifferential(updated, rootId, { id: 'parallel-child' });
    expect(noParallel.differentials[0].differentials).toHaveLength(1);
    expect(findElement(noParallel, 'parallel-child')).toBeNull();
  });

  it('migrates parallel legacy root differentials into one serial root tree without data loss', () => {
    const migrated = normalizeDrawing({ differentials: [
      { id: 'd1', label: 'Eerste', branches: [{ endpoint: { id: 'battery', type: 'battery' } }] },
      { id: 'd2', label: 'Tweede', branches: [{ endpoint: { id: 'inverter', type: 'inverter' } }] },
    ] });
    expect(migrated.differentials).toHaveLength(1);
    expect(migrated.differentials[0].id).toBe('d1');
    expect(migrated.differentials[0].differentials[0].id).toBe('d2');
    expect(findElement(migrated, 'battery')).not.toBeNull();
    expect(findElement(migrated, 'inverter')).not.toBeNull();
  });

  it('does not delete the required main differential', () => {
    const drawing = createEmptyDrawing();
    expect(deleteElement(drawing, drawing.differentials[0].id).differentials).toHaveLength(1);
  });

  it.each(['circuit', 'battery', 'inverter', 'hybrid-inverter', 'rem-breaker'])('adds a protected %s branch', endpointType => {
    const drawing = createEmptyDrawing();
    const updated = addBranch(drawing, drawing.differentials[0].id, endpointType, { endpoint: { id: `endpoint-${endpointType}` } });
    expect(updated.differentials[0].branches[0].endpoint.type).toBe(endpointType);
  });

  it('lets REM contain ordinary circuits only', () => {
    let drawing = createEmptyDrawing();
    drawing = addBranch(drawing, drawing.differentials[0].id, 'rem-breaker', { endpoint: { id: 'rem' } });
    drawing = addRemCircuit(drawing, 'rem', { id: 'child', endpoint: { id: 'circuit', type: 'battery' } });
    expect(findElement(drawing, 'circuit')).toMatchObject({ type: 'circuit', parentId: 'rem' });
  });

  it('updates, reorders and recursively deletes REM children', () => {
    let drawing = createEmptyDrawing();
    drawing = addBranch(drawing, drawing.differentials[0].id, 'rem-breaker', { endpoint: { id: 'rem' } });
    drawing = addRemCircuit(drawing, 'rem', { id: 'child-1', endpoint: { id: 'first' } });
    drawing = addRemCircuit(drawing, 'rem', { id: 'child-2', endpoint: { id: 'second' } });
    drawing = updateElement(drawing, 'first', { label: 'Verlichting' });
    drawing = moveElement(drawing, 'second', -1);
    expect(findElement(drawing, 'rem').element.circuits.map(child => child.endpoint.id)).toEqual(['second', 'first']);
    expect(findElement(deleteElement(drawing, 'rem'), 'first')).toBeNull();
  });
});
