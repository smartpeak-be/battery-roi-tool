import { describe, expect, it } from 'vitest';
import {
  addSituationElement,
  addSituationRectangle,
  constrainSituationSegment,
  createEmptySituation,
  deleteSituationElement,
  normalizeSituation,
  projectSituationPointToWall,
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

  it('snaps wall endpoints to the grid and only allows horizontal, vertical or 45 degree lines', () => {
    expect(constrainSituationSegment({ x: 13, y: 17 }, { x: 146, y: 42 })).toEqual({ x1: 20, y1: 20, x2: 140, y2: 20 });
    expect(constrainSituationSegment({ x: 13, y: 17 }, { x: 118, y: 100 })).toEqual({ x1: 20, y1: 20, x2: 120, y2: 120 });
    expect(constrainSituationSegment({ x: 17, y: 17 }, { x: 35, y: 155 })).toEqual({ x1: 20, y1: 20, x2: 20, y2: 160 });
  });

  it('adds a room rectangle as four connected wall segments in one operation', () => {
    const situation = addSituationRectangle(createEmptySituation(), { x1: 23, y1: 37, x2: 303, y2: 217 });
    expect(situation.elements).toHaveLength(4);
    expect(situation.elements.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual([
      [20, 40, 300, 40], [300, 40, 300, 220], [300, 220, 20, 220], [20, 220, 20, 40],
    ]);
  });

  it('projects doors and windows onto the nearest wall and adopts its angle', () => {
    let situation = addSituationElement(createEmptySituation(), 'wall', { id: 'wall', x1: 20, y1: 40, x2: 300, y2: 40 });
    situation = addSituationElement(situation, 'wall', { id: 'diagonal', x1: 300, y1: 40, x2: 440, y2: 180 });
    expect(projectSituationPointToWall(situation, { x: 145, y: 52 })).toMatchObject({ x: 140, y: 40, rotation: 0, wallId: 'wall' });
    expect(projectSituationPointToWall(situation, { x: 370, y: 118 })).toMatchObject({ x: 380, y: 120, rotation: 45, wallId: 'diagonal' });
    const withDoor = addSituationElement(situation, 'door', { x: 380, y: 120, rotation: 45 });
    expect(withDoor.elements.at(-1).rotation).toBe(45);
    expect(projectSituationPointToWall(situation, { x: 700, y: 600 }, 30)).toBeNull();
  });
});
