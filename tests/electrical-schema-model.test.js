import { describe, expect, it } from 'vitest';
import {
  addCircuit,
  addDifferential,
  addBreaker,
  createEmptyDrawing,
  deleteElement,
  findElement,
  moveElement,
  normalizeDrawing,
  updateElement,
} from '../assets/js/electrical-schema-model.js';

describe('eendraadschema model', () => {
  it('starts as an empty project-ready drawing', () => {
    expect(createEmptyDrawing({ projectId: 'project-1' })).toMatchObject({
      version: 1,
      projectId: 'project-1',
      title: 'Eendraadschema',
      differentials: [],
    });
  });

  it('builds a differential → breaker → circuit hierarchy', () => {
    let drawing = createEmptyDrawing();
    drawing = addDifferential(drawing, { id: 'diff-1', label: 'Hoofddifferentieel', amperage: 40, sensitivityMa: 300 });
    drawing = addBreaker(drawing, 'diff-1', { id: 'breaker-1', label: 'Batterij', poles: 2, amperage: 20 });
    drawing = addCircuit(drawing, 'breaker-1', { id: 'circuit-1', label: 'Thuisbatterij', cable: '3G2,5' });

    expect(drawing.differentials[0].breakers[0].circuits[0]).toMatchObject({
      id: 'circuit-1',
      label: 'Thuisbatterij',
      cable: '3G2,5',
    });
    expect(findElement(drawing, 'breaker-1')).toMatchObject({ type: 'breaker', parentId: 'diff-1' });
  });

  it('updates, reorders and recursively deletes elements without mutating the source', () => {
    const source = addDifferential(
      addDifferential(createEmptyDrawing(), { id: 'd1', label: 'D1' }),
      { id: 'd2', label: 'D2' },
    );
    const updated = updateElement(source, 'd1', { label: 'Diff 1' });
    const moved = moveElement(updated, 'd2', -1);
    const deleted = deleteElement(moved, 'd1');

    expect(source.differentials.map(item => item.label)).toEqual(['D1', 'D2']);
    expect(moved.differentials.map(item => item.id)).toEqual(['d2', 'd1']);
    expect(deleted.differentials.map(item => item.id)).toEqual(['d2']);
  });

  it('normalizes legacy or malformed values to safe defaults', () => {
    const normalized = normalizeDrawing({
      title: '',
      projectId: 42,
      differentials: [{ id: 'd', breakers: [{ id: 'b', circuits: [{}] }] }],
    });

    expect(normalized.title).toBe('Eendraadschema');
    expect(normalized.projectId).toBeNull();
    expect(normalized.differentials[0]).toMatchObject({ amperage: 40, sensitivityMa: 300 });
    expect(normalized.differentials[0].breakers[0]).toMatchObject({ amperage: 20, poles: 2 });
    expect(normalized.differentials[0].breakers[0].circuits[0].label).toBe('Nieuwe kring');
  });
});
