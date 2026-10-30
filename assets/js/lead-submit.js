// Lead wizard without the Firebase SDK: the same calculation as lead.html, but the lead
// and its result mail are written through the public Firestore REST API. The public
// rules in firestore.rules allow exactly this, so no keys or sign-in are needed.
// Used by the website embed (widgets/lead-wizard.js); runs in browsers and in Node.

import { validateCsvHeaders, extractCsvForStorage } from './csv.js';
import { csvToAllDaysAndMeta, parseSheetConfigs } from './calc-engine.js';
import { resolveLeadInputs, selectBestConfigs, buildLeadResult, buildDefaultsNotes, buildPublicIndication } from './lead-calc.js';
import {
  LEAD_RESULT_SUBJECT, LEAD_CONTACT_TO, leadContactSubject, buildLeadResultMailHtml, buildLeadContactMailHtml
} from './lead-mail.js';

export const FIRESTORE_URL =
  'https://firestore.googleapis.com/v1/projects/smartpeak-projects/databases/(default)/documents';
export const LEAD_RESULT_TTL_DAYS = 30;

/**
 * Check a Fluvius CSV export and turn it into days.
 * @returns {{ ok: true, days: number, allDays: Array } | { ok: false, error: string }}
 */
export function readConsumptionCsv(csvText) {
  const validation = validateCsvHeaders(csvText);
  if (!validation.valid) return { ok: false, error: validation.errors.join(' ') };
  try {
    const { allDays } = csvToAllDaysAndMeta(csvText);
    return { ok: true, days: allDays.length, allDays };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Fout bij verwerken van CSV.' };
  }
}

/** Encode a plain JS value as a Firestore REST `Value`. */
export function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields(value) } };
  throw new Error(`Cannot store value of type ${typeof value}`);
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function documentRoot(baseUrl) {
  return baseUrl.slice(baseUrl.indexOf('/projects/') + 1);
}

function randomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function commit(fetchImpl, baseUrl, writes) {
  const response = await fetchImpl(`${baseUrl}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
  if (!response.ok) {
    throw new Error(`Firestore ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/** Battery configurations from the product sheet named in Firestore config/products. */
export async function loadProductConfigs({ baseUrl = FIRESTORE_URL, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${baseUrl}/config/products`);
  if (!response.ok) throw new Error('Productconfiguratie niet beschikbaar.');
  const csvUrl = (await response.json()).fields?.csvUrl?.stringValue;
  if (!csvUrl) throw new Error('Productconfiguratie niet beschikbaar.');
  const sheet = await fetchImpl(csvUrl);
  if (!sheet.ok) throw new Error('Kon productlijst niet ophalen.');
  const configs = parseSheetConfigs(await sheet.text());
  if (!configs.length) throw new Error('Geen batterij-configuraties gevonden.');
  return configs;
}

/**
 * Pure: the lead document exactly as lead.html stores it (minus the server timestamps).
 * `source` (optional) is noted so the dashboard shows where the lead came from.
 */
export function buildLeadDoc({ csvText, allDays, name, email, phone, pvInverterKw, pricePerKwh, houseAgeOver10Years, source, requestContact }, configs) {
  const rawInputs = {
    pvInverterKw: Number(pvInverterKw) || 0,
    pricePerKwh: Number(pricePerKwh) || 0,
    houseAgeOver10Years: houseAgeOver10Years === true || houseAgeOver10Years === false ? houseAgeOver10Years : null
  };
  const resolved = resolveLeadInputs(rawInputs);
  const bestConfigs = selectBestConfigs(allDays, configs, resolved.pvInverterKw, resolved.pricePerKwh, resolved.effectiveBtw);
  const cleanPhone = cleanPhoneNumber(phone);
  const notes = [
    source ? `Verbruiksanalyse via de website (${String(source).slice(0, 200)})` : '',
    requestContact ? `Vraagt contact na de analyse${cleanPhone ? `. Telefoon: ${cleanPhone}` : ''}` : '',
    buildDefaultsNotes(resolved.defaultsUsed)
  ].filter(Boolean).join('\n\n');
  return {
    customerName: String(name).replace(/\s+/g, ' ').trim().slice(0, 120),
    email: String(email).trim(),
    csvDailyCompact: extractCsvForStorage(csvText).dailyCompact,
    pvInverterKw: resolved.pvInverterKw,
    pricePerKwh: resolved.pricePerKwh,
    houseAgeOver10Years: rawInputs.houseAgeOver10Years,
    defaultsUsed: resolved.defaultsUsed,
    notes: notes.slice(0, 2000),
    result: bestConfigs.length ? buildLeadResult(bestConfigs) : null,
    effectiveBtw: resolved.effectiveBtw,
    keuring: true
  };
}

/** A phone number as typed, limited to digits, spaces and the usual separators. */
export function cleanPhoneNumber(phone) {
  return String(phone || '').replace(/[^\d+ ()./-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

/**
 * Create the lead (cold_lead) and queue the result mail, like lead.html does.
 * With `requestContact` (the visitor asked for a site visit) the lead becomes a hot lead in the
 * same second commit and Kevin and Ruben get the contact notification, as from lead-result.html.
 * @param {object} input  csvText, name, email and the optional fields of the wizard
 * @param {object} opts   resultPageUrl (lead-result.html), configs (optional, preloaded),
 *                        baseUrl and fetchImpl (for tests)
 * @returns {Promise<{ leadId: string, resultUrl: string }>}
 */
export async function submitLeadAnalysis(input, { resultPageUrl, configs, baseUrl = FIRESTORE_URL, fetchImpl = fetch } = {}) {
  if (!resultPageUrl) throw new Error('resultPageUrl is required');
  const read = readConsumptionCsv(input.csvText);
  if (!read.ok) throw new Error(read.error);
  const productConfigs = configs || await loadProductConfigs({ baseUrl, fetchImpl });
  const leadDoc = buildLeadDoc({ ...input, allDays: read.allDays }, productConfigs);

  const root = documentRoot(baseUrl);
  const leadId = randomId();
  const expires = new Date(Date.now() + LEAD_RESULT_TTL_DAYS * 86400000);

  await commit(fetchImpl, baseUrl, [{
    update: {
      name: `${root}/leads/${leadId}`,
      fields: toFirestoreFields({
        ...leadDoc,
        status: 'cold_lead',
        hotLeadAt: null,
        deletedAt: null,
        resultExpiresAt: expires
      })
    },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false }
  }]);

  const resultUrl = `${resultPageUrl}?r=${leadId}`;
  // The mail rule checks that the lead exists, so this must be a second commit.
  const followUp = [];
  if (input.requestContact) {
    followUp.push({
      // Same change as updateLeadToHot: only status and hotLeadAt (isPublicHotLeadUpdate).
      update: { name: `${root}/leads/${leadId}`, fields: toFirestoreFields({ status: 'hot_lead' }) },
      updateMask: { fieldPaths: ['status'] },
      updateTransforms: [{ fieldPath: 'hotLeadAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true }
    }, {
      update: {
        name: `${root}/mail/lead_contact_${leadId}`,
        fields: toFirestoreFields({
          kind: 'lead_contact',
          leadId,
          to: LEAD_CONTACT_TO,
          message: {
            subject: leadContactSubject(leadDoc.customerName),
            html: buildLeadContactMailHtml(
              { ...leadDoc, phone: cleanPhoneNumber(input.phone) },
              { indication: buildPublicIndication(read.allDays, leadDoc.pricePerKwh), source: input.source || '' }
            )
          }
        })
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false }
    });
  }
  await commit(fetchImpl, baseUrl, [...followUp, {
    update: {
      name: `${root}/mail/lead_result_${leadId}`,
      fields: toFirestoreFields({
        kind: 'lead_result',
        leadId,
        to: leadDoc.email,
        message: {
          subject: LEAD_RESULT_SUBJECT,
          html: buildLeadResultMailHtml({ customerName: leadDoc.customerName, resultUrl, defaultsUsed: leadDoc.defaultsUsed })
        }
      })
    },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false }
  }]);

  return { leadId, resultUrl };
}
