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
  drawing = addBranch(drawing, rootId, 'battery', { breaker: { customProperties: [{ key: 'Ref', value: 'QF2' }] }, endpoint: { label: 'Batterij', cable: '3G6', cablePlacement: 'surface', brand: 'Zendure', model: 'SolarFlow', serialNumber: 'SN-12345', powerKw: 2.4, capacityKwh: 5.76, note: 'Eerste regel tweede regel derde regel', customProperties: [{ key: 'Protocol', value: 'Modbus' }] } });
  drawing = addBranch(drawing, rootId, 'inverter', { endpoint: { label: 'Omvormer' } });
  drawing = addBranch(drawing, rootId, 'rem-breaker', { id: 'rem-branch', endpoint: { id: 'rem', label: 'REM verdeler' } });
  drawing = addRemCircuit(drawing, 'rem', { endpoint: { id: 'kring-1', label: 'Verlichting', circuitLabel: 'A', cable: '3G1,5', cablePlacement: 'surface', note: 'Gelijkvloers' } });
  drawing = addRemCircuit(drawing, 'rem', { endpoint: { id: 'kring-2', label: 'Stopcontacten' } });
  return drawing;
}

function pdfText(drawing) { return new TextDecoder('latin1').decode(buildElectricalSchemaPdf(drawing)); }

describe('electrical schema PDF', () => {
  it('generates a valid landscape PDF with schema labels and title block', () => {
    const bytes = buildElectricalSchemaPdf({ ...sampleDrawing(), connectionType: '3x230' }, { projectName: 'Project Test', address: 'Teststraat 1', installer: 'SmartPeak' });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('EENDRAADSCHEMA');
    expect(text).toContain('Project Test');
    expect(text).toContain('Zendure');
    expect(text).toContain('BTW BE0730.696.050');
    expect(text).toContain('3 x 230 V - 50 Hz');
    expect(text).toContain('/MediaBox [0 0 842 595]');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('renders a tree where shared differential and REM distributor occur once', () => {
    const text = pdfText(remTreeDrawing());
    expect(text.match(/Hoofddifferentieel/g)).toHaveLength(1);
    expect(text).not.toContain('REM verdeler');
    expect(text).toContain('(Batterij)');
    expect(text).toContain('(Omvormer)');
    expect(text).not.toContain('(Verlichting)');
    expect(text).not.toContain('(Stopcontacten)');
    // Graphical AREI/IEC contacts replace the temporary A/D letter icons.
    expect(text).not.toContain('(A)');
    expect(text).not.toContain('(D)');
    expect(text).toContain('I dN 300mA  40A');
    // Bottom-up feed: main breaker rises from y=145 and joins the tree on y=173.
    expect(text).toContain('70 164 m 70 173 l S');
    expect(text).toContain('70 173 m');
  });

  it('places component labels beside their symbols in the bottom-up layout', () => {
    const text = pdfText(remTreeDrawing());
    // sideText uses x + 19; no component name is centered on the vertical conductor.
    expect(text).toMatch(/BT \/F2 6\.5 Tf [\d.]+ [\d.]+ Td \(Batterij\) Tj ET/);
    expect(text).toMatch(/BT \/F2 6\.5 Tf [\d.]+ [\d.]+ Td \(Hoofddifferentieel\) Tj ET/);
    expect(text).not.toContain('REM verdeler');
  });

  it('renders all entered metadata, cable placement and an open circuit end', () => {
    const text = pdfText(remTreeDrawing());
    ['3G6', 'Zendure SolarFlow', 'SN: SN-12345', '2.4kW', '5.76kWh', 'Protocol: Modbus', 'Ref: QF2', 'Kring A', '3G1,5', 'Gelijkvloers'].forEach(value => expect(text).toContain(`(${value})`));
    expect(text).toContain('(O)');
    expect(text).not.toContain('(K)');
  });

  it('omits internal circuit and breaker names while retaining an explicit circuit label', () => {
    let drawing = createEmptyDrawing({ title: 'Geen interne namen' });
    drawing = addBranch(drawing, drawing.differentials[0].id, 'circuit', {
      breaker: { label: 'Interne zekeringnaam' },
      endpoint: { label: 'Interne kringnaam', circuitLabel: 'B2', cable: '3G2,5' },
    });
    const text = pdfText(drawing);
    expect(text).not.toContain('Interne zekeringnaam');
    expect(text).not.toContain('Interne kringnaam');
    expect(text).toContain('Kring B2');
  });

  it('omits the extra sensing circle beside a differential and lays wrapped text top-to-bottom', () => {
    const text = pdfText(remTreeDrawing());
    expect(text).not.toContain('402.5 220 c');
    const first = text.match(/([\d.]+) Td \(Eerste regel tweede\) Tj ET/);
    const second = text.match(/([\d.]+) Td \(regel derde regel\) Tj ET/);
    expect(Number(first?.[1])).toBeGreaterThan(Number(second?.[1]));
  });

  it('paginates wide drawings', () => {
    expect(pdfText(sampleDrawing(9))).toContain('/Count 2');
  });
});
