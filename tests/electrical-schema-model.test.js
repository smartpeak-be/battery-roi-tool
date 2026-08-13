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

describe('eendraadschema model v6', () => {
  it('starts with main breaker followed by exactly one main differential', () => {
    const drawing = createEmptyDrawing({ projectId: 'project-1' });
    expect(drawing).toMatchObject({
      version: 6,
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

  it('stores cable placement and a free circuit label while preserving empty optional metadata', () => {
    let drawing = createEmptyDrawing();
    drawing = addBranch(drawing, drawing.differentials[0].id, 'circuit', {
      endpoint: { id: 'circuit-meta', label: 'Stopcontacten keuken', circuitLabel: 'A1', cable: '3G2,5', cablePlacement: 'surface', note: 'Aparte voeding' },
    });
    const endpoint = findElement(drawing, 'circuit-meta').element;
    expect(endpoint).toMatchObject({ circuitLabel: 'A1', cablePlacement: 'surface', note: 'Aparte voeding' });
    const legacy = normalizeDrawing({ differentials: [{ branches: [{ endpoint: { id: 'legacy', type: 'circuit', cablePlacement: 'invalid' } }] }] });
    expect(legacy.differentials[0].branches[0].endpoint.cablePlacement).toBe('');
  });

  it('normalizes custom key/value properties on every editable electrical element', () => {
    const drawing = normalizeDrawing({
      mainBreaker: { customProperties: [{ key: 'Kast', value: 'Hoofdbord' }, { key: '', value: 'negeren' }] },
      differentials: [{
        customProperties: [{ key: 'Type', value: 'A' }],
        branches: [{
          breaker: { customProperties: [{ key: 'Merk', value: 'Hager' }] },
          endpoint: { id: 'custom-device', type: 'inverter', customProperties: [{ key: 'Firmware', value: '1.2.3' }, { key: 'Leeg', value: '' }] },
        }],
      }],
    });
    expect(drawing.mainBreaker.customProperties).toEqual([{ key: 'Kast', value: 'Hoofdbord' }]);
    expect(drawing.differentials[0].customProperties).toEqual([{ key: 'Type', value: 'A' }]);
    expect(drawing.differentials[0].branches[0].breaker.customProperties).toEqual([{ key: 'Merk', value: 'Hager' }]);
    expect(findElement(drawing, 'custom-device').element.customProperties).toEqual([{ key: 'Firmware', value: '1.2.3' }]);
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
