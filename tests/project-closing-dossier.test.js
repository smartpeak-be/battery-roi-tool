import { describe, expect, it } from 'vitest';
import {
  buildClosingDossierModel,
  buildClosingDossierDraftTexts,
  openClosingDossierPrintWindow,
  renderClosingDossierEditorModalHtml,
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
    expect(model.timeline).toHaveLength(0);
    expect(JSON.stringify(model).toLowerCase()).not.toContain('payback');
    expect(JSON.stringify(model).toLowerCase()).not.toContain('terugverdientijd');
  });

  it('gebruikt thumbnails als PDF-bron en houdt originele foto als link bij', () => {
    const model = buildClosingDossierModel(baseProject, {
      photos: [{
        id: 'photo-big',
        tag: 'situatie',
        name: 'plaatsing.jpg',
        downloadUrl: 'https://storage.test/full/plaatsing-8mb.jpg',
        thumbUrl: 'https://storage.test/thumbs/plaatsing-800w.jpg',
      }],
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.photos.situation[0].url).toBe('https://storage.test/thumbs/plaatsing-800w.jpg');
    expect(model.photos.situation[0].fullUrl).toBe('https://storage.test/full/plaatsing-8mb.jpg');
    expect(html).toContain('<img src="https://storage.test/thumbs/plaatsing-800w.jpg"');
    expect(html).toContain('href="https://storage.test/full/plaatsing-8mb.jpg"');
    expect(html).toContain('class="spcd-photo-full-link"');
    expect(html).toContain('object-fit:contain');
  });

  it('rendert klantvriendelijk zonder fake logo, interne keuken of letterlijke klantperspectief-copy', () => {
    const project = {
      ...baseProject,
      situation: 'Klant wil batterij plaatsen voor hoger eigenverbruik.',
      technical: {
        earthResistanceMeasured: true,
        earthResistanceOhm: 12.4,
        earthResistanceMeasuredDate: '2026-05-18',
        voltageMeasurements: { l1N: 230, l1Pe: 0.6 },
        technicalNotes: 'Omvormer bereikbaar in technische ruimte.',
      },
      solar: { inverters: [{
        brand: 'Huawei',
        model: 'SUN2000',
        powerKw: 5,
        panelCount: 10,
        circuitCount: 2,
        circuits: [
          { panelCount: 5, voltage: 320, panelBrand: 'Jinko', panelModel: 'Tiger Neo' },
          { panelCount: 5, voltage: 318, panelBrand: 'Jinko', panelModel: 'Tiger Neo' },
        ],
      }] },
      site: { houseAgeOver10Years: true },
      lastCalcRun: {
        ...baseProject.lastCalcRun,
        results: {
          ...baseProject.lastCalcRun.results,
          configResults: [{
            cfg: {
              ...baseProject.lastCalcRun.results.configResults[0].cfg,
              items: [
                { productId: 'bat-1', qty: 2 },
                { productId: 'inv-1', qty: 1 },
              ],
            },
          }],
        },
      },
    };
    const model = buildClosingDossierModel(project, {
      productsById: {
        'bat-1': { brand: 'Zendure', model: 'AB2000S', specs: { capacityKwh: 1.92, weightKg: 25 }, datasheetUrl: 'https://example.test/ab2000s.pdf', manualUrl: 'https://example.test/manual.pdf' },
        'inv-1': { brand: 'Zendure', model: 'SolarFlow 2400 AC', specs: { powerKw: 2.4 }, datasheetUrl: 'https://example.test/sf2400.pdf' },
      },
      categoriesById: {},
      comments: [{ text: 'woning is ouder dan 10 jaar, intern checken' }],
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(html).toContain('Projectoverzicht');
    expect(html).not.toContain('Projectoverzicht vanuit klantperspectief');
    expect(html).not.toContain('⚡');
    expect(html).not.toContain('woning is ouder dan 10 jaar');
    expect(html).toContain('Klant wil batterij plaatsen voor hoger eigenverbruik.');
    expect(html).toContain('Technische gegevens en metingen');
    expect(html).toContain('Aardweerstand');
    expect(html).toContain('12.4 Ω');
    expect(html).toContain('Spanning L1 - N');
    expect(html).toContain('230 V');
    expect(html).toContain('Huawei SUN2000');
    expect(html).toContain('10 panelen');
    expect(html).toContain('PV-omvormer 1 · kring 1');
    expect(html).toContain('320 V');
    expect(html).toContain('Jinko Tiger Neo');
    expect(html).toContain('Geplaatste onderdelen');
    expect(html).toContain('2x');
    expect(html).toContain('Zendure AB2000S');
    expect(html).toContain('1x');
    expect(html).toContain('Zendure SolarFlow 2400 AC');
    expect(html).toContain('Datasheet');
    expect(html).toContain('Handleiding');
  });

  it('verbergt optionele originele aanvraag en ROI-context wanneer er geen tekst is', () => {
    const model = buildClosingDossierModel(baseProject, { generatedAt: '2026-06-11T18:00:00.000Z' });
    const drafts = buildClosingDossierDraftTexts(model);
    const html = renderClosingDossierHtml(model);

    expect(drafts.originalRequest).toBe('');
    expect(html).not.toContain('<h2>Originele aanvraag</h2>');
    expect(html).not.toContain('Verbruik / injectie samenvatting');
    expect(html).not.toContain('ROI-detail');
    expect(html).not.toContain('terugverdientijd');
  });

  it('neemt geplaatste onderdelen, specs en productdocumenten mee via gekoppelde productconfig', () => {
    const project = {
      ...baseProject,
      lastCalcRun: {
        ...baseProject.lastCalcRun,
        results: {
          ...baseProject.lastCalcRun.results,
          configResults: [{
            cfg: {
              type: 'PC_cfg-1',
              productConfigId: 'cfg-1',
              omschrijving: 'Catalogusconfiguratie',
              batCap: 10,
              batInv: 5,
            },
          }],
        },
      },
    };
    const model = buildClosingDossierModel(project, {
      productConfigsById: {
        'cfg-1': { id: 'cfg-1', items: [{ productId: 'bat-1', qty: 2 }, { productId: 'inv-1', qty: 1 }] },
      },
      productsById: {
        'bat-1': { id: 'bat-1', brand: 'Zendure', model: 'AB2000S', specs: { capacityKwh: 1.92, weightKg: 25 } },
        'inv-1': { id: 'inv-1', brand: 'Zendure', model: 'SolarFlow 2400 AC', specs: { inverterPowerKw: 2.4 } },
      },
      productDocumentsById: {
        'bat-1': [
          { name: 'AB2000S datasheet.pdf', downloadUrl: 'https://example.test/ab2000s-ds.pdf' },
          { name: 'AB2000S manual.pdf', downloadUrl: 'https://example.test/ab2000s-manual.pdf' },
        ],
        'inv-1': [{ name: 'SolarFlow 2400 AC handleiding.pdf', downloadUrl: 'https://example.test/sf-manual.pdf' }],
      },
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.placedItems).toHaveLength(2);
    expect(html).toContain('1,92 kWh · 25 kg');
    expect(html).toContain('2,4 kW omvormer');
    expect(html).toContain('AB2000S datasheet.pdf');
    expect(html).toContain('AB2000S manual.pdf');
    expect(html).toContain('SolarFlow 2400 AC handleiding.pdf');
    expect(model.documents.handleidingen.some(d => d.downloadUrl === 'https://example.test/ab2000s-ds.pdf')).toBe(true);
    expect(model.documents.handleidingen.some(d => d.downloadUrl === 'https://example.test/sf-manual.pdf')).toBe(true);
    expect(model.documents.technischeFiches.some(d => d.downloadUrl === 'https://example.test/ab2000s-ds.pdf')).toBe(false);
  });

  it('maakt virtuele offerte-documenten als link openbaar in het dossier', () => {
    const model = buildClosingDossierModel(baseProject, {
      documents: [{
        source: 'project.offertes',
        documentKind: 'offer',
        configType: 'ZSF2400AC+_2X1',
        name: 'Offerte_OFF-024035_DavidVerberckmoes.pdf',
        downloadUrl: 'https://storage.test/offerte.pdf',
      }],
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.solution.offerteUrl).toBe('https://storage.test/offerte.pdf');
    expect(html).toContain('<a href="https://storage.test/offerte.pdf" target="_blank" rel="noopener">Offerte_OFF-024035_DavidVerberckmoes.pdf</a>');
  });

  it('neemt geplaatste producten uit installedSolution wanneer de calc-config geen itemregels heeft', () => {
    const project = {
      ...baseProject,
      installedSolution: {
        items: [
          {
            productId: 'sf-2400',
            label: 'Zendure Solarflow 2400 AC+',
            quantity: 2,
            specs: { capacityKwh: 2.4, inverterPowerKw: 2.4, weightKg: 27.8 },
          },
          {
            productId: 'ab3000l',
            label: 'Zendure AB3000L',
            quantity: 2,
            specs: { capacityKwh: 2.88, weightKg: 26.3 },
          },
        ],
      },
    };
    const model = buildClosingDossierModel(project, {
      productDocumentsById: {
        'sf-2400': [{ name: 'SolarFlow 2400 AC+ handleiding.pdf', downloadUrl: 'https://example.test/sf-manual.pdf' }],
        ab3000l: [{ name: 'AB3000L datasheet.pdf', downloadUrl: 'https://example.test/ab3000l-ds.pdf' }],
      },
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.placedItems).toHaveLength(2);
    expect(html).toContain('2x');
    expect(html).toContain('Zendure Solarflow 2400 AC+');
    expect(html).toContain('2,4 kWh · 2,4 kW omvormer · 27,8 kg');
    expect(html).toContain('Zendure AB3000L');
    expect(html).toContain('2,88 kWh · 26,3 kg');
    expect(html).toContain('SolarFlow 2400 AC+ handleiding.pdf');
    expect(html).toContain('AB3000L datasheet.pdf');
    expect(html).toContain('class="spcd-doc-links"');
    expect(html).toContain('class="spcd-logo"');
    expect(html).toContain('assets/img/smartpeak-logo-mark.png');
    expect(html).toContain('class="spcd-logo-name">SmartPeak</div>');
    expect(html).toContain('class="spcd-logo-tagline">Slim omgaan met jouw energie</div>');
    expect(html).toContain('aria-label="SmartPeak');
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('text-decoration:underline');
    expect(html).toContain('overflow-wrap:anywhere');
    expect(model.documents.handleidingen.some(d => d.downloadUrl === 'https://example.test/ab3000l-ds.pdf')).toBe(true);
    expect(model.documents.technischeFiches.some(d => d.downloadUrl === 'https://example.test/ab3000l-ds.pdf')).toBe(false);
  });

  it('gebruikt de geplaatste oplossing als waarheid, ook wanneer de calc-config itemregels heeft', () => {
    const project = {
      ...baseProject,
      installedSolution: {
        items: [{
          productId: 'real-battery',
          label: 'Werkelijk geplaatste batterij',
          quantity: 3,
          specs: { capacityKwh: 3.2, weightKg: 29 },
        }],
      },
      lastCalcRun: {
        ...baseProject.lastCalcRun,
        results: {
          ...baseProject.lastCalcRun.results,
          configResults: [{
            cfg: {
              type: 'PC_calc-1',
              productConfigId: 'calc-1',
              omschrijving: 'Calculatieconfiguratie',
              batCap: 10,
              batInv: 5,
              items: [{ productId: 'calc-product', qty: 1 }],
            },
          }],
        },
      },
    };
    const model = buildClosingDossierModel(project, {
      productsById: {
        'calc-product': { id: 'calc-product', brand: 'Niet', model: 'Geplaatst', specs: { capacityKwh: 99 } },
      },
      productDocumentsById: {
        'real-battery': [{ name: 'Werkelijke handleiding.pdf', downloadUrl: 'https://example.test/real-manual.pdf' }],
      },
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.placedItems).toHaveLength(1);
    expect(html).toContain('Werkelijk geplaatste batterij');
    expect(html).toContain('De geplaatste oplossing is 3x Werkelijk geplaatste batterij');
    expect(html).toContain('geregistreerde batterijcapaciteit');
    expect(html).toContain('9,6 kWh');
    expect(html).toContain('3x');
    expect(html).toContain('3,2 kWh · 29 kg');
    expect(html).toContain('Werkelijke handleiding.pdf');
    expect(html).not.toContain('Niet Geplaatst');
    expect(html).not.toContain('99 kWh');
  });

  it('neemt SmartPeak contactgegevens en reviewlink op in het dossier', () => {
    const model = buildClosingDossierModel(baseProject, {
      reviewRequest: { url: 'https://app.smartpeak.be/review.html?r=req-123' },
      generatedAt: '2026-06-11T18:00:00.000Z',
    });
    const html = renderClosingDossierHtml(model);

    expect(model.company.address).toBe('Terwestvaart 11, 9180 Moerbeke-Waas (Lokeren)');
    expect(model.company.vat).toBe('BE0730696050');
    expect(model.company.email).toBe('info@smartpeak.be');
    expect(model.company.phone).toBe('0469 76 23 60');
    expect(model.review.url).toBe('https://app.smartpeak.be/review.html?r=req-123');
    expect(html).toContain('SmartPeak contactgegevens');
    expect(html).toContain('Terwestvaart 11, 9180 Moerbeke-Waas (Lokeren)');
    expect(html).toContain('BE0730696050');
    expect(html).toContain('mailto:info@smartpeak.be');
    expect(html).toContain('tel:0469762360');
    expect(html).toContain('<a href="https://app.smartpeak.be/review.html?r=req-123" target="_blank" rel="noopener">Review invullen</a>');
  });

  it('genereert een reviewrequest voordat het dashboard het afsluitdossiermodel bouwt', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../assets/js/pages/dashboard-app.js', import.meta.url), 'utf8'));
    const reviewIdx = source.indexOf('await createReviewRequestForProject(project.id)');
    const modelIdx = source.indexOf('buildClosingDossierModel(dossierProject, { photos, reviewRequest, ...dossierInputs })');

    expect(reviewIdx).toBeGreaterThan(-1);
    expect(modelIdx).toBeGreaterThan(reviewIdx);
  });

  it('biedt vooraf ingevulde tekstvakken aan die voor generatie aangepast kunnen worden', () => {
    const model = buildClosingDossierModel({
      ...baseProject,
      situation: 'Bestaande aanvraag uit projectbeschrijving.',
      technical: { technicalNotes: 'Technische notitie.' },
    }, { generatedAt: '2026-06-11T18:00:00.000Z' });

    const drafts = buildClosingDossierDraftTexts(model);
    const modalHtml = renderClosingDossierEditorModalHtml(drafts);
    const html = renderClosingDossierHtml(model, {
      texts: {
        originalRequest: 'Aangepaste klanttekst aanvraag.',
        projectSummary: 'Aangepast projectoverzicht.',
        technicalSummary: 'Aangepaste technische toelichting.',
      },
    });

    expect(drafts.originalRequest).toContain('Bestaande aanvraag uit projectbeschrijving.');
    expect(modalHtml).toContain('textarea');
    expect(modalHtml).toContain('data-closing-text="originalRequest"');
    expect(modalHtml).toContain('data-closing-text="projectSummary"');
    expect(modalHtml).toContain('data-closing-text="technicalSummary"');
    expect(html).toContain('Aangepaste klanttekst aanvraag.');
    expect(html).toContain('Aangepast projectoverzicht.');
    expect(html).toContain('Aangepaste technische toelichting.');
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
