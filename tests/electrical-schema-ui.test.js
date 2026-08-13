import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('eendraadschema v6 UI integration', () => {
  const html = read('schema/index.html');
  const app = read('assets/js/pages/electrical-schema-app.js');
  const css = read('assets/css/electrical-schema.css');
  const firebase = read('assets/js/firebase-init.js');

  it('starts at a main breaker and offers nested differentials', () => {
    expect(html).toContain('id="mainBreaker"');
    expect(html).toContain('Onderliggend differentieel');
    expect(app).toContain("addDifferential(drawing, addingParentId)");
    expect(app).toContain('Hoofdautomaat');
    expect(html).not.toContain('id="btnAddDifferential"');
  });

  it.each([
    ['circuit', 'Gewone kring'], ['battery', 'Batterij'], ['inverter', 'Omvormer'],
    ['hybrid-inverter', 'Hybride omvormer'], ['rem-breaker', 'REM-automaatkring'],
  ])('offers the %s endpoint choice', (type, label) => {
    expect(html).toContain(`data-add-type="${type}"`);
    expect(html).toContain(label);
    expect(app).toContain(`'${type}'`);
  });

  it('uses distinct electrical symbols for all endpoint types', () => {
    expect(css).toContain('.symbol-battery');
    expect(css).toContain('.symbol-inverter');
    expect(css).toContain('.symbol-hybrid');
    expect(css).toContain('.symbol-circuit');
  });

  it('has a real PDF action and persists model v6 including the main breaker', () => {
    expect(html).toContain('id="btnPdf"');
    expect(app).toContain('downloadElectricalSchemaPdf');
    expect(firebase).toContain('mainBreaker:');
    expect(firebase).toContain('Number(drawing?.version) || 6');
  });

  it('offers cable placement and a free circuit label in the editor', () => {
    expect(app).toContain("field('Kringlabel', 'circuitLabel'");
    expect(app).toContain("value: 'surface', label: 'Opbouw / in buis (O)'");
    expect(app).toContain("'Plaatsing kabel'");
  });

  it('grows custom key/value property rows and includes the installer VAT number', () => {
    expect(app).toContain('customPropertyRow');
    expect(app).toContain("getAll('customPropertyKey')");
    expect(app).toContain("last.insertAdjacentHTML('afterend'");
    expect(app).toContain('BTW BE0730.696.050');
    expect(css).toContain('.custom-property-row');
  });
});
