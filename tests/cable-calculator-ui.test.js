import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'cable/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/pages/cable-calculator-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/cable-calculator.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

describe('cable calculator page', () => {
  it('keeps all four calculations in one compact selector instead of large mode cards', () => {
    expect(html).toContain('id="calculationMode"');
    for (const mode of ['required', 'check', 'capacity', 'distance']) {
      expect(html).toContain(`value="${mode}"`);
    }
    expect(html).not.toContain('role="tablist"');
    expect(css).not.toContain('.cable-mode');
  });

  it('keeps the normal flow to only the practical inputs', () => {
    expect(html).toContain('Wat wil je berekenen?');
    expect(html).toContain('Aansluiting');
    expect(html).toContain('Vermogen of stroom');
    expect(html).toContain('Afstand');
    expect(html).toContain('Kabelsectie');
    expect(html).toContain('<summary>Meer opties</summary>');
    expect(html.indexOf('<summary>Meer opties</summary>')).toBeLessThan(html.indexOf('id="circuitType"'));
  });

  it('offers Belgian net types, DC and PV without a second redundant preset selector', () => {
    expect(html).toContain('value="three230"');
    expect(html).toContain('3×230 V');
    expect(html).toContain('value="three400"');
    expect(html).toContain('value="three400-single"');
    expect(html).toContain('value="dc"');
    expect(html).toContain('value="pv"');
    expect(html).not.toContain('id="applicationPreset"');
  });

  it('keeps technical and safety nuance available without filling the main screen with prose', () => {
    expect(html).toContain('id="thermalAmpacity"');
    expect(html).toContain('id="rho"');
    expect(html).toContain('Rekent op spanningsval');
    expect(html).not.toContain('Overgangs- en contactweerstanden');
    expect(app).toContain('c1011VoltageRise');
  });

  it('keeps PV detail inputs inside the advanced section', () => {
    for (const id of ['pvStringVoltage', 'pvStringCurrent', 'pvVmpPanel', 'pvVocPanel', 'pvImpPanel', 'pvIscPanel', 'pvSeries']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(app).toContain('calculatePvArray');
  });

  it('renders a direct answer and compact 1 through 5 percent comparison', () => {
    expect(app).toContain('VOLTAGE_DROP_REFERENCES');
    for (const limit of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`<option value="${limit}"`);
    }
    expect(app).toContain('cable-answer');
    expect(app).toContain('cable-limits');
    expect(app).not.toContain('Vergelijk kabelsecties');
    expect(app).not.toContain('Schuif de belasting');
  });

  it('has a compact responsive layout', () => {
    expect(css).toContain('.cable-form-grid');
    expect(css).toContain('@media (max-width: 700px)');
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
