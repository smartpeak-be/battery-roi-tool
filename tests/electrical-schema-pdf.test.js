import { describe, expect, it } from 'vitest';
import { buildElectricalSchemaPdf } from '../assets/js/electrical-schema-pdf.js';
import { addBranch, addRemCircuit, createEmptyDrawing } from '../assets/js/electrical-schema-model.js';

function sampleDrawing(branchCount = 1) {
  let drawing = createEmptyDrawing({ title: 'Schema woning' });
  const rootId = drawing.differentials[0].id;
  for (let index = 0; index < branchCount; index += 1) {
    drawing = addBranch(drawing, rootId, index % 2 ? 'inverter' : 'battery', {
      endpoint: { label: `Toestel ${index + 1}`, brand: 'Zendure', model: 'SolarFlow', powerKw: 2.4 },
    });
  }
  return drawing;
}

function remTreeDrawing() {
  let drawing = createEmptyDrawing({ title: 'Boomschema' });
  const rootId = drawing.differentials[0].id;
  drawing = addBranch(drawing, rootId, 'battery', { endpoint: { label: 'Batterij' } });
  drawing = addBranch(drawing, rootId, 'inverter', { endpoint: { label: 'Omvormer' } });
  drawing = addBranch(drawing, rootId, 'rem-breaker', { id: 'rem-branch', endpoint: { id: 'rem', label: 'REM verdeler' } });
  drawing = addRemCircuit(drawing, 'rem', { endpoint: { id: 'kring-1', label: 'Verlichting' } });
  drawing = addRemCircuit(drawing, 'rem', { endpoint: { id: 'kring-2', label: 'Stopcontacten' } });
  return drawing;
}

function pdfText(drawing) { return new TextDecoder('latin1').decode(buildElectricalSchemaPdf(drawing)); }

describe('electrical schema PDF', () => {
  it('generates a valid landscape PDF with schema labels and title block', () => {
    const bytes = buildElectricalSchemaPdf(sampleDrawing(), { projectName: 'Project Test', address: 'Teststraat 1', installer: 'SmartPeak' });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('EENDRAADSCHEMA');
    expect(text).toContain('Project Test');
    expect(text).toContain('Zendure');
    expect(text).toContain('/MediaBox [0 0 842 595]');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('renders a tree where shared differential and REM distributor occur once', () => {
    const text = pdfText(remTreeDrawing());
    expect(text.match(/Hoofddifferentieel/g)).toHaveLength(1);
    expect(text.match(/REM verdeler/g)).toHaveLength(1);
    expect(text).toContain('(Batterij)');
    expect(text).toContain('(Omvormer)');
    expect(text).toContain('(Verlichting)');
    expect(text).toContain('(Stopcontacten)');
    // Graphical AREI/IEC contacts replace the temporary A/D letter icons.
    expect(text).not.toContain('(A)');
    expect(text).not.toContain('(D)');
    expect(text).toContain('I dN 300mA  40A');
  });

  it('paginates wide drawings', () => {
    expect(pdfText(sampleDrawing(9))).toContain('/Count 2');
  });
});
