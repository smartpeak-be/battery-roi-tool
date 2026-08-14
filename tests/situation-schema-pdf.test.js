import { describe, expect, it } from 'vitest';
import { buildSituationSchemaPdf } from '../assets/js/electrical-schema-pdf.js';
import { addSituationElement, createEmptySituation } from '../assets/js/situation-schema-model.js';

function sampleSituation() {
  let situation = addSituationElement(createEmptySituation(), 'wall', { id: 'wall', x1: 80, y1: 80, x2: 800, y2: 80, label: 'Voorgevel' });
  situation = addSituationElement(situation, 'window', { id: 'window', x1: 250, y1: 80, x2: 380, y2: 80, label: 'Raam keuken' });
  situation = addSituationElement(situation, 'door', { id: 'door', x: 500, y: 80, rotation: 90, mirrored: true, label: 'Voordeur' });
  situation = addSituationElement(situation, 'distribution-board', { id: 'board', x: 180, y: 260, label: 'Verdeelkast' });
  situation = addSituationElement(situation, 'inverter', { id: 'inverter', x: 360, y: 260, label: 'Omvormer garage' });
  situation = addSituationElement(situation, 'battery', { id: 'battery', x: 520, y: 260, label: 'Batterij garage' });
  return addSituationElement(situation, 'earth', { id: 'earth', x: 700, y: 260, label: 'Aardingspunt' });
}

describe('situation schema PDF', () => {
  it('creates a true A4-landscape PDF with the shared SmartPeak title block', () => {
    const text = new TextDecoder('latin1').decode(buildSituationSchemaPdf(sampleSituation(), {
      projectName: 'Project Test', address: 'Teststraat 1', installer: 'SmartPeak',
      installerDetails: 'Terwestvaart 11 - 9180 Moerbeke-Waas', installerVat: 'BTW BE0730.696.050', connectionType: '3x230',
    }));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 842 595]');
    expect(text).toContain('(SITUATIESCHEMA)');
    expect(text).toContain('(PLAATS VAN DE ELEKTRISCHE INSTALLATIE)');
    expect(text).toContain('(INSTALLATEUR)');
    expect(text).toContain('(BTW BE0730.696.050)');
    expect(text).toContain('(Project Test)');
    expect(text).toContain('(3 x 230 V - 50 Hz)');
    expect(text).toContain('(Raam keuken)');
    expect(text).toContain('(Voordeur)');
    expect(text).toContain('(Verdeelkast)');
    expect(text).toContain('(Omvormer garage)');
    expect(text).toContain('(Batterij garage)');
    expect(text).toContain('(Aardingspunt)');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });
});
