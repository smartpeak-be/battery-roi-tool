import { describe, expect, it } from 'vitest';
import {
  buildClosingDossierModel,
  renderClosingDossierHtml,
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

  it('rendert moderne SmartPeak HTML met print/PDF-knop en duidelijke placeholders', () => {
    const model = buildClosingDossierModel(baseProject, {
      comments: [],
      photos: [],
      documents: [],
      generatedAt: '2026-06-11T18:00:00.000Z',
    });

    const html = renderClosingDossierHtml(model);

    expect(html).toContain('Afsluitdossier installatie');
    expect(html).toContain('SmartPeak');
    expect(html).toContain('David Verberkmoes');
    expect(html).toContain('Spelonckvaart 64A, 9180 Lokeren');
    expect(html).toContain('data-closing-dossier-print');
    expect(html).toContain('Facturen');
    expect(html).toContain('Technische fiches');
    expect(html).toContain('Handleidingen');
    expect(html).toContain('De berekening zelf wordt niet opgenomen');
    expect(html).not.toContain('14.1');
  });
});
