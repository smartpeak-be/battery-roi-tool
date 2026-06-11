import { describe, expect, it } from 'vitest';
import {
  buildClosingDossierModel,
  openClosingDossierPrintWindow,
} from '../assets/js/project-closing-dossier.js';

const baseProject = {
  id: 'p1',
  customerName: 'David Verberkmoes',
  status: 'keuring_gepland',
  customer: {
    email: 'david@example.be',
    phone: '0474000000',
    address: 'Spelonckvaart 64A, 9180 Lokeren',
  },
  planning: {
    installationDoneDate: '2026-05-18',
    inspectionPlannedDate: '2026-06-18',
  },
  csvUpload: {
    eanCode: '541448860003609976',
    meterNr: '1LGZ0577246202',
    meterType: 'Digitale meter',
  },
  lastCalcRun: {
    calculatedAt: '2026-05-02T06:00:00.000Z',
    inputs: {
      pvInv: 5,
      selectedConfigTypes: ['ZSF2400AC+_2X1'],
    },
    results: {
      windowStart: '2025-03-09',
      lastDate: '2026-03-09',
      totalAfname: 10214.79,
      totalInjectie: 2984.46,
      effectivePrice: 0.34,
      configResults: [{
        cfg: {
          type: 'ZSF2400AC+_2X1',
          omschrijving: '2 X Solarflow 2400 AC+ + 1 bat 10,56 Kwh',
          batCap: 10,
          batInv: 4.8,
        },
      }],
    },
  },
  offertes: {
    'ZSF2400AC+_2X1': {
      filename: 'Offerte_OFF-024035_DavidVerberckmoes.pdf',
      contentType: 'application/pdf',
    },
  },
  serialNumbers: [
    { category: 'omvormer_batterij', value: 'HEC4NENCN530563', source: 'ocr' },
    { category: 'batterij', value: 'GO2ASNBP0201070', source: 'ocr' },
  ],
};

describe('project closing dossier', () => {
  it('bouwt een klantgericht dossiermodel zonder ROI/payback velden', () => {
    const model = buildClosingDossierModel(baseProject, {
      comments: [
        { createdAt: '2026-05-06T07:58:47.264Z', text: 'voorschot ontvangen' },
        { createdAt: '2026-06-11T14:31:43.931Z', text: 'Keuring ingepland' },
      ],
      photos: [
        { id: 's1', tag: 'situatie', name: 'situatie.jpg', downloadUrl: 'https://example.test/situatie.jpg' },
        { id: 'sn1', tag: 'serial', name: 'serial.jpg', downloadUrl: 'https://example.test/serial.jpg' },
      ],
      documents: [
        { id: 'd1', title: 'Factuur voorschot', name: 'factuur.pdf', contentType: 'application/pdf', downloadUrl: 'https://example.test/factuur.pdf' },
      ],
      generatedAt: '2026-06-11T18:00:00.000Z',
    });

    expect(model.customer.name).toBe('David Verberkmoes');
    expect(model.solution.description).toBe('2 X Solarflow 2400 AC+ + 1 bat 10,56 Kwh');
    expect(model.photos.situation).toHaveLength(1);
    expect(model.photos.serial).toHaveLength(1);
    expect(model.documents.facturen).toHaveLength(1);
    expect(JSON.stringify(model).toLowerCase()).not.toContain('payback');
    expect(JSON.stringify(model).toLowerCase()).not.toContain('terugverdientijd');
  });

  it('opent het printvenster schrijfbaar zonder noopener zodat about:blank niet leeg blijft', () => {
    const model = buildClosingDossierModel(baseProject, { generatedAt: '2026-06-11T18:00:00.000Z' });
    const calls = [];
    const written = [];
    const fakeWindow = {
      open: (...args) => {
        calls.push(args);
        return {
          document: {
            open: () => written.push('open'),
            write: html => written.push(html),
            close: () => written.push('close'),
          },
          focus: () => written.push('focus'),
        };
      },
    };
    const previousWindow = globalThis.window;
    globalThis.window = fakeWindow;

    try {
      const result = openClosingDossierPrintWindow(model);

      expect(result.ok).toBe(true);
      expect(calls[0][0]).toBe('');
      expect(calls[0][1]).toBe('smartpeakClosingDossier');
      const features = calls[0][2] || '';
      expect(features).not.toContain('noopener');
      expect(features).not.toContain('noreferrer');
      expect(written.some(v => typeof v === 'string' && v.includes('Afsluitdossier installatie'))).toBe(true);
      expect(written).toContain('focus');
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
});
