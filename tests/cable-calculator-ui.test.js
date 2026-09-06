import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'cable/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/pages/cable-calculator-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/cable-calculator.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

describe('cable calculator page', () => {
  it('offers all four bidirectional calculation modes as accessible tabs', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-mode="required" role="tab" aria-selected="true"');
    expect(html).toContain('data-mode="capacity"');
    expect(html).toContain('data-mode="distance"');
    expect(html).toContain('data-mode="check"');
  });

  it('offers Belgian net types, DC, PV and practical application presets', () => {
    expect(html).toContain('value="three230"');
    expect(html).toContain('3×230 V zonder nul');
    expect(html).toContain('value="three400"');
    expect(html).toContain('value="three400-single"');
    expect(html).toContain('value="dc"');
    expect(html).toContain('value="pv"');
    for (const preset of ['ev', 'pv-inverter', 'battery-inverter', 'dc-battery', 'pv-string']) {
      expect(html).toContain(`value="${preset}"`);
    }
    expect(app).toContain('applyApplicationPreset');
  });

  it('explains the one-way length convention and thermal limitation', () => {
    expect(html).toContain('fysieke afstand in één richting');
    expect(html).toContain('uitsluitend op spanningsverschil');
    expect(html).toContain('geen maximale veilige kabelstroom');
  });

  it('does not present 3 percent as a Belgian legal limit or a voltage-only result as a full cable approval', () => {
    expect(html).toContain('niet een algemene Belgische wettelijke bovengrens');
    expect(html).toContain('&lt; 1%');
    expect(html).toContain('volledige relevante AC-traject tussen hoofdmeter en productie-eenheid');
    expect(app).toContain('Sectie op basis van spanningsval');
    expect(app).toContain('geen conformiteitsverklaring');
    expect(app).toContain('c1011VoltageRise');
  });

  it('contains simple and advanced PV inputs including Voc and Isc', () => {
    for (const id of ['pvStringVoltage', 'pvStringCurrent', 'pvVmpPanel', 'pvVocPanel', 'pvImpPanel', 'pvIscPanel', 'pvSeries']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(app).toContain('calculatePvArray');
  });

  it('always renders 1, 2 and 3 percent references and cable comparison', () => {
    expect(app).toContain('VOLTAGE_DROP_REFERENCES');
    expect(app).toContain('Vergelijk kabelsecties');
    expect(app).toContain('sectionComparison');
  });

  it('has a live capacity slider and responsive touch layout', () => {
    expect(app).toContain('id="capacitySlider"');
    expect(css).toContain('.cable-mode');
    expect(css).toContain('@media (max-width: 575.98px)');
  });

  it('loads the Firebase compat SDKs required by shared firebase-init', () => {
    expect(html).toContain('firebase-app-compat.js');
    expect(html).toContain('firebase-auth-compat.js');
    expect(html).toContain('firebase-firestore-compat.js');
    expect(html.indexOf('firebase-firestore-compat.js')).toBeLessThan(html.indexOf('firebase-init.js'));
  });

  it('is linked from the authenticated dashboard', () => {
    expect(dashboard).toContain('href="cable/"');
    expect(dashboard).toContain('Kabelcalculator');
  });
});
