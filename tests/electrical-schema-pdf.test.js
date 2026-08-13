import { describe, expect, it } from 'vitest';
import { buildElectricalSchemaPdf } from '../assets/js/electrical-schema-pdf.js';
import { addBranch, addDifferential, addRemCircuit, createEmptyDrawing } from '../assets/js/electrical-schema-model.js';

function sampleDrawing(branchCount = 1) {
  let drawing = addDifferential(createEmptyDrawing({ title: 'Schema woning' }), null, { id: 'd1', label: 'Hoofddifferentieel' });
  for (let index = 0; index < branchCount; index += 1) {
    drawing = addBranch(drawing, 'd1', index % 2 ? 'inverter' : 'battery', {
      endpoint: { label: `Toestel ${index + 1}`, brand: 'Zendure', model: 'SolarFlow', powerKw: 2.4 },
    });
  }
  return drawing;
}

function remTreeDrawing() {
  let drawing = addDifferential(createEmptyDrawing({ title: 'Boomschema' }), null, { id: 'main-diff', label: 'Hoofddifferentieel' });
  drawing = addBranch(drawing, 'main-diff', 'battery', { endpoint: { label: 'Batterij' } });
  drawing = addBranch(drawing, 'main-diff', 'inverter', { endpoint: { label: 'Omvormer' } });
  drawing = addBranch(drawing, 'main-diff', 'rem-breaker', { id: 'rem-branch', endpoint: { id: 'rem', label: 'REM verdeler' } });
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
    // Explicit breaker/differential symbols are labelled A and D inside their shapes.
    expect(text).toContain('(A)');
    expect(text).toContain('(D)');
  });

  it('paginates wide drawings', () => {
    expect(pdfText(sampleDrawing(9))).toContain('/Count 2');
  });
});
