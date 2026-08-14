import { describe, expect, it } from 'vitest';
import {
  addSituationElement,
  createEmptySituation,
  deleteSituationElement,
  normalizeSituation,
  transformSituationElement,
  updateSituationElement,
} from '../assets/js/situation-schema-model.js';

describe('situatieschema model v1', () => {
  it('normalizes a versioned canvas and supported elements', () => {
    const situation = normalizeSituation({
      version: 99,
      viewport: { width: 0, height: 900 },
      elements: [
        { id: 'wall-1', type: 'wall', x1: 10, y1: 20, x2: 300, y2: 20, label: 'Voorgevel' },
        { id: 'bad', type: 'lamp', x: 5, y: 5 },
      ],
    });
    expect(situation).toMatchObject({ version: 1, viewport: { width: 1120, height: 900 } });
    expect(situation.elements).toEqual([
      expect.objectContaining({ id: 'wall-1', type: 'wall', x1: 10, y1: 20, x2: 300, y2: 20, label: 'Voorgevel' }),
    ]);
  });

  it('adds and updates walls and windows while keeping immutable state', () => {
    const empty = createEmptySituation();
    const withWall = addSituationElement(empty, 'wall', { id: 'wall', x1: 20, y1: 30, x2: 220, y2: 30 });
    const withWindow = addSituationElement(withWall, 'window', { id: 'window', x1: 70, y1: 30, x2: 140, y2: 30 });
    const updated = updateSituationElement(withWindow, 'window', { label: 'Raam keuken', x2: 160 });
    expect(empty.elements).toHaveLength(0);
    expect(updated.elements).toHaveLength(2);
    expect(updated.elements[1]).toMatchObject({ type: 'window', label: 'Raam keuken', x2: 160 });
  });

  it('keeps architectural elements unlabeled by default', () => {
    let situation = addSituationElement(createEmptySituation(), 'wall');
    situation = addSituationElement(situation, 'window');
    situation = addSituationElement(situation, 'door');
    expect(situation.elements.map(item => item.label)).toEqual(['', '', '']);
  });

  it.each(['door', 'distribution-board', 'inverter', 'battery', 'earth'])('places, moves, rotates and mirrors a %s', type => {
    let situation = addSituationElement(createEmptySituation(), type, { id: type, x: 100, y: 120, label: 'Test' });
    situation = transformSituationElement(situation, type, { dx: 25, dy: -10, rotate: 90, mirror: true });
    expect(situation.elements[0]).toMatchObject({ x: 125, y: 110, rotation: 90, mirrored: true });
    situation = transformSituationElement(situation, type, { rotate: 360, mirror: true });
    expect(situation.elements[0]).toMatchObject({ rotation: 90, mirrored: false });
  });

  it('deletes only the selected element', () => {
    let situation = addSituationElement(createEmptySituation(), 'door', { id: 'door' });
    situation = addSituationElement(situation, 'battery', { id: 'battery' });
    expect(deleteSituationElement(situation, 'door').elements.map(item => item.id)).toEqual(['battery']);
  });
});
