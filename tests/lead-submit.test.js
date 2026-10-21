import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readConsumptionCsv,
  toFirestoreValue,
  buildLeadDoc,
  loadProductConfigs,
  submitLeadAnalysis
} from '../assets/js/lead-submit.js';

const CSV = readFileSync(new URL('../e2e/fixtures/test-fluvius.csv', import.meta.url), 'utf8');
const BASE = 'https://firestore.test/v1/projects/p/databases/(default)/documents';
const SHEET = [
  'type,omschrijving,nuttig opslag,omvorm vermogen,efficientie,prijs install 6%,prijs install en keuring 6%,prijs install 21%,prijs install en keuring 21%',
  'ZSF-A,Zendure A,"5,76",2.4,95,"€ 3.000,00","€ 3.200,00","€ 3.500,00","€ 3.700,00"',
  'ZSF-B,Zendure B,"11,52",2.4,95,"€ 5.000,00","€ 5.200,00","€ 5.800,00","€ 6.000,00"',
  'MARVE-X,Marstek,5,2.5,95,"€ 1.000,00","€ 1.100,00","€ 1.200,00","€ 1.300,00"'
].join('\n');

function fakeFirestore() {
  const commits = [];
  const fetchImpl = async (url, init) => {
    if (url === `${BASE}/config/products`) {
      return new Response(JSON.stringify({ fields: { csvUrl: { stringValue: 'https://sheet.test/csv' } } }));
    }
    if (url === 'https://sheet.test/csv') return new Response(SHEET);
    if (url === `${BASE}:commit`) {
      commits.push(JSON.parse(init.body));
      return new Response('{}');
    }
    return new Response('not found', { status: 404 });
  };
  return { commits, fetchImpl };
}

describe('readConsumptionCsv', () => {
  it('reads the Fluvius test export', () => {
    const r = readConsumptionCsv(CSV);
    expect(r.ok).toBe(true);
    expect(r.days).toBeGreaterThan(0);
  });

  it('rejects a file without Fluvius columns', () => {
    const r = readConsumptionCsv('a;b;c\n1;2;3');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Verplichte kolommen/);
  });
});

describe('toFirestoreValue', () => {
  it('encodes the value types a lead uses', () => {
    expect(toFirestoreValue(21)).toEqual({ integerValue: '21' });
    expect(toFirestoreValue(0.34)).toEqual({ doubleValue: 0.34 });
    expect(toFirestoreValue(Infinity)).toEqual({ nullValue: null });
    expect(toFirestoreValue(null)).toEqual({ nullValue: null });
    expect(toFirestoreValue(true)).toEqual({ booleanValue: true });
    expect(toFirestoreValue([1, 'a'])).toEqual({ arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'a' }] } });
    expect(toFirestoreValue({ min: 1, max: 2.5 })).toEqual({
      mapValue: { fields: { min: { integerValue: '1' }, max: { doubleValue: 2.5 } } }
    });
    expect(toFirestoreValue(new Date('2026-01-01T00:00:00Z'))).toEqual({ timestampValue: '2026-01-01T00:00:00.000Z' });
  });
});

describe('loadProductConfigs', () => {
  it('reads the sheet named in config/products', async () => {
    const { fetchImpl } = fakeFirestore();
    const configs = await loadProductConfigs({ baseUrl: BASE, fetchImpl });
    expect(configs.map(c => c.type)).toEqual(['ZSF-A', 'ZSF-B', 'MARVE-X']);
    expect(configs[0].prices['21_yes']).toBe(3700);
  });
});

describe('buildLeadDoc', () => {
  it('matches the lead.html shape and notes the website source', () => {
    const { allDays } = readConsumptionCsv(CSV);
    const configs = [
      { type: 'ZSF-A', batCap: 5.76, batInv: 2.4, eff: 0.95, prices: { '21_yes': 3700, '6_yes': 3200 } }
    ];
    const doc = buildLeadDoc({
      csvText: CSV, allDays, name: '  Jan   Peeters ', email: ' jan@example.be ',
      pvInverterKw: '', pricePerKwh: 0.3, houseAgeOver10Years: true, source: '/batterij-iets-voor-mij/'
    }, configs);
    expect(doc.customerName).toBe('Jan Peeters');
    expect(doc.email).toBe('jan@example.be');
    expect(doc.pvInverterKw).toBe(3.5);
    expect(doc.pricePerKwh).toBe(0.3);
    expect(doc.effectiveBtw).toBe(6);
    expect(doc.defaultsUsed).toEqual({ pvInverterKw: true, pricePerKwh: false, houseAgeOver10Years: false });
    expect(doc.notes).toMatch(/^Verbruiksanalyse via de website \(\/batterij-iets-voor-mij\/\)/);
    expect(doc.notes).toMatch(/Omvormervermogen: 3,5 kW/);
    expect(doc.keuring).toBe(true);
    expect(Object.keys(doc.csvDailyCompact)).toEqual(
      ['startDate', 'afname', 'injectie', 'afnamedag', 'afnamenacht', 'injectiedag', 'injectienacht']
    );
    expect(doc.result === null || typeof doc.result === 'object').toBe(true);
  });

  it('stores an unanswered house age as null', () => {
    const { allDays } = readConsumptionCsv(CSV);
    const doc = buildLeadDoc({ csvText: CSV, allDays, name: 'A', email: 'a@b.be' }, []);
    expect(doc.houseAgeOver10Years).toBeNull();
    expect(doc.effectiveBtw).toBe(21);
    expect(doc.result).toBeNull();
  });
});

describe('submitLeadAnalysis', () => {
  it('creates only the lead; the server queues the result mail', async () => {
    const { commits, fetchImpl } = fakeFirestore();
    const { leadId, resultUrl } = await submitLeadAnalysis(
      { csvText: CSV, name: 'Test', email: 'test@example.be', source: '/batterij-iets-voor-mij/' },
      { baseUrl: BASE, fetchImpl, resultPageUrl: 'https://tool.test/lead-result.html' }
    );
    expect(leadId).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(resultUrl).toBe(`https://tool.test/lead-result.html?r=${leadId}`);
    expect(commits).toHaveLength(1);

    const [lead] = commits[0].writes;
    expect(lead.update.name).toBe(`projects/p/databases/(default)/documents/leads/${leadId}`);
    expect(lead.currentDocument).toEqual({ exists: false });
    expect(lead.updateTransforms).toEqual([{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]);
    const f = lead.update.fields;
    expect(f.status).toEqual({ stringValue: 'cold_lead' });
    expect(f.hotLeadAt).toEqual({ nullValue: null });
    expect(f.deletedAt).toEqual({ nullValue: null });
    expect(f.resultExpiresAt.timestampValue).toBeTruthy();
    expect(f.houseAgeOver10Years).toEqual({ nullValue: null });
    expect(Object.keys(f).sort()).toEqual([
      'csvDailyCompact', 'customerName', 'defaultsUsed', 'deletedAt', 'effectiveBtw', 'email',
      'hotLeadAt', 'houseAgeOver10Years', 'keuring', 'notes', 'pricePerKwh', 'pvInverterKw',
      'result', 'resultExpiresAt', 'status'
    ]);
    // Only Zendure configs are proposed, as in lead.html.
    expect(JSON.stringify(f.result)).not.toContain('MARVE');
  });

  it('refuses an invalid CSV before writing anything', async () => {
    const { commits, fetchImpl } = fakeFirestore();
    await expect(submitLeadAnalysis(
      { csvText: 'x;y\n1;2', name: 'T', email: 't@e.be' },
      { baseUrl: BASE, fetchImpl, resultPageUrl: 'https://tool.test/lead-result.html' }
    )).rejects.toThrow(/Verplichte kolommen/);
    expect(commits).toHaveLength(0);
  });
});
