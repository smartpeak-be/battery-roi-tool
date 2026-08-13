import { describe, expect, it } from 'vitest';
import { buildElectricalSchemaPdf } from '../assets/js/electrical-schema-pdf.js';
import { addBranch, addDifferential, createEmptyDrawing } from '../assets/js/electrical-schema-model.js';

function sampleDrawing(branchCount = 1) {
  let drawing = addDifferential(createEmptyDrawing({ title: 'Schema woning' }), null, { id: 'd1' });
  for (let index = 0; index < branchCount; index += 1) {
    drawing = addBranch(drawing, 'd1', index % 2 ? 'inverter' : 'battery', {
      endpoint: { label: `Toestel ${index + 1}`, brand: 'Zendure', model: 'SolarFlow', powerKw: 2.4 },
    });
  }
  return drawing;
}

describe('electrical schema PDF', () => {
  it('generates a valid landscape PDF with schema labels and title block', () => {
    const bytes = buildElectricalSchemaPdf(sampleDrawing(), {
      projectName: 'Project Test',
      customerName: 'Klant Test',
      address: 'Teststraat 1',
      installer: 'SmartPeak',
    });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('EENDRAADSCHEMA');
    expect(text).toContain('Project Test');
    expect(text).toContain('Zendure');
    expect(text).toContain('/MediaBox [0 0 842 595]');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('paginates wide drawings', () => {
    const text = new TextDecoder('latin1').decode(buildElectricalSchemaPdf(sampleDrawing(9)));
    expect(text).toContain('/Count 2');
  });
});
