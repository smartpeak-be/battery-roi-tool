import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('situatieschema static UI integration', () => {
  const html = read('schema/index.html');
  const app = read('assets/js/pages/electrical-schema-app.js');
  const css = read('assets/css/electrical-schema.css');
  const firebase = read('assets/js/firebase-init.js');

  it('offers adjacent one-line and situation tabs with an SVG workspace', () => {
    expect(html).toContain('data-schema-tab="electrical"');
    expect(html).toContain('data-schema-tab="situation"');
    expect(html).toContain('id="situationCanvas"');
    expect(html).toContain('<svg');
    expect(app).toContain("activeTab = 'situation'");
  });

  it.each([
    ['wall', 'Muur'], ['window', 'Raam'], ['door', 'Deur'],
    ['distribution-board', 'Verdeelkast'], ['inverter', 'Omvormer'],
    ['battery', 'Batterij'], ['earth', 'Aardingspunt'],
  ])('offers the touch tool %s', (tool, label) => {
    expect(html).toContain(`data-situation-tool="${tool}"`);
    expect(html).toContain(label);
  });

  it('uses pointer drag for direct drawing and moving', () => {
    expect(app).toContain("addEventListener('pointerdown'");
    expect(app).toContain("addEventListener('pointermove'");
    expect(app).toContain("addEventListener('pointerup'");
    expect(app).toContain('setPointerCapture');
    expect(css).toContain('touch-action:none');
  });

  it('exposes selection label, rotate, mirror and delete actions', () => {
    expect(html).toContain('id="situationLabel"');
    expect(html).toContain('id="btnSituationRotate"');
    expect(html).toContain('id="btnSituationMirror"');
    expect(html).toContain('id="btnSituationDelete"');
    expect(app).toContain('transformSituationElement');
    expect(app).toContain('deleteSituationElement');
  });

  it('persists versioned situation data and upserts distinct project PDFs', () => {
    expect(firebase).toContain('situation: drawing?.situation');
    expect(app).toContain('buildSituationSchemaPdf');
    expect(app).toContain("'situation'");
    expect(firebase).toContain('situation-schema-${drawingId}');
    expect(firebase).toContain("documentKind: 'situation_schema'");
    expect(firebase).toContain('electrical-schema-${drawingId}');
  });
});
