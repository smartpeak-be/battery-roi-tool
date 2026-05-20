import * as functions from 'firebase-functions/v2';
import admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';

if (!admin.apps.length) admin.initializeApp();

// Vision client — lazy singleton. Firebase CLI loads this module during deploy
// analysis; constructing the client eagerly can trigger local ADC/metadata
// lookups and make deployment time out before the backend spec is discovered.
let visionClient = null;
function getVisionClient() {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient({ apiEndpoint: 'eu-vision.googleapis.com' });
  }
  return visionClient;
}

// Mirrors assets/js/serial-extract.js exactly. If this diverges, the
// browser and server will pick different serials from the same photo.
const SERIAL_REGEX = /^[A-Z0-9-]{6,}$/i;
const TOKEN_SPLIT = /[^A-Za-z0-9-]+/;
const LABEL_TOKEN_REGEX = /^(?:s\/?n|sn|serial|serialno|serialnumber|serienummer|serienr|nr|no)$/i;
const LABEL_IN_TEXT_REGEX = /\b(?:s\s*\/?\s*n|sn|serial(?:\s*(?:no|number|nr|#))?|serie\s*nummer|serienummer)\b/i;
const DATE_LIKE_REGEX = /^(?:19|20)\d{2}-\d{1,2}-\d{1,2}$/;
const MEASUREMENT_LIKE_REGEX = /^\d+(?:V|A|W|KW|KWH|WH|KG|HZ)$/i;
const COMMON_NON_SERIAL_TOKENS = new Set([
  'MARSTEK', 'ZENDURE', 'MODEL', 'TYPE', 'SERIAL', 'SERIENUMMER', 'BATTERY',
  'BATTERIJ', 'OMVORMER', 'INVERTER', 'WARNING', 'INPUT', 'OUTPUT', 'MADE',
  'CHINA', 'CE', 'FCC', 'WIFI', 'BLUETOOTH', 'APP', 'CODE', 'QRCODE',
]);

export function extractSerialFromOcr(textAnnotations, opts = {}) {
  if (!Array.isArray(textAnnotations) || textAnnotations.length === 0) {
    return { value: '', candidates: [] };
  }
  const seen = new Set();
  const candidateMap = new Map();
  const candidates = [];

  function addCandidate(tok, source = {}) {
    if (!_isSerialCandidate(tok)) return null;
    const key = tok.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(tok);
    }
    let item = candidateMap.get(key);
    if (!item) {
      item = { key, value: tok, sources: [], firstOrder: candidates.length - 1 };
      candidateMap.set(key, item);
    }
    item.sources.push(source);
    return item;
  }

  const imageMaxY = _maxAnnotationY(textAnnotations);
  for (let annIndex = 0; annIndex < textAnnotations.length; annIndex++) {
    const ann = textAnnotations[annIndex];
    const desc = (ann && typeof ann.description === 'string') ? ann.description : '';
    if (!desc) continue;
    const yRatio = _annotationYRatio(ann, imageMaxY);
    for (const tok of _tokens(desc)) {
      addCandidate(tok, { kind: 'ocr-token', annIndex, yRatio });
    }
  }
  _addLabelContextCandidates(textAnnotations, addCandidate, imageMaxY);

  if (candidates.length === 0) return { value: '', candidates: [] };
  const sorted = [...candidateMap.values()].sort((a, b) => {
    const scoreDiff = _scoreCandidate(b, opts) - _scoreCandidate(a, opts);
    if (scoreDiff) return scoreDiff;
    const lengthDiff = b.value.length - a.value.length;
    if (lengthDiff) return lengthDiff;
    return a.firstOrder - b.firstOrder;
  });
  return { value: sorted[0].value, candidates };
}

function _tokens(text) {
  return String(text || '').split(TOKEN_SPLIT).filter(Boolean);
}

function _normalizedLabelToken(text) {
  return String(text || '').replace(/[^A-Za-z0-9/]+/g, '').toLowerCase();
}

function _isSerialCandidate(tok) {
  if (!tok || !SERIAL_REGEX.test(tok)) return false;
  const upper = tok.toUpperCase();
  if (COMMON_NON_SERIAL_TOKENS.has(upper)) return false;
  if (DATE_LIKE_REGEX.test(tok)) return false;
  if (MEASUREMENT_LIKE_REGEX.test(tok)) return false;
  return true;
}

function _addLabelContextCandidates(textAnnotations, addCandidate, imageMaxY) {
  const fullText = textAnnotations[0] && typeof textAnnotations[0].description === 'string'
    ? textAnnotations[0].description
    : '';
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LABEL_IN_TEXT_REGEX.test(line)) continue;
    const afterLabel = line.replace(/^.*?(?:s\s*\/?\s*n|sn|serial(?:\s*(?:no|number|nr|#))?|serie\s*nummer|serienummer)\s*[:#-]?\s*/i, '');
    const sameLineCandidate = _tokens(afterLabel).find(_isSerialCandidate);
    if (sameLineCandidate) {
      addCandidate(sameLineCandidate, { kind: 'label-same-line', bonus: 1000 });
      continue;
    }
    const nextLineCandidate = _tokens(lines[i + 1] || '').find(_isSerialCandidate);
    if (nextLineCandidate) addCandidate(nextLineCandidate, { kind: 'label-next-line', bonus: 900 });
  }

  for (let i = 1; i < textAnnotations.length; i++) {
    const ann = textAnnotations[i];
    const desc = ann && typeof ann.description === 'string' ? ann.description : '';
    if (!LABEL_TOKEN_REGEX.test(_normalizedLabelToken(desc))) continue;
    for (let j = i + 1; j < Math.min(textAnnotations.length, i + 6); j++) {
      const nextAnn = textAnnotations[j];
      const yRatio = _annotationYRatio(nextAnn, imageMaxY);
      const candidate = _tokens(nextAnn && nextAnn.description).find(_isSerialCandidate);
      if (candidate) {
        addCandidate(candidate, { kind: 'after-label-token', bonus: 850 - ((j - i) * 30), annIndex: j, yRatio });
        break;
      }
    }
  }
}

function _scoreCandidate(candidate, opts) {
  let score = candidate.value.length;
  if (/[A-Za-z]/.test(candidate.value) && /\d/.test(candidate.value)) score += 120;
  if (candidate.value.includes('-')) score += 30;
  for (const source of candidate.sources) {
    if (source.bonus) score += source.bonus;
    if (typeof source.yRatio === 'number') {
      if (source.yRatio > 0.55) score += Math.round(source.yRatio * 40);
      if (opts.category === 'batterij' && source.yRatio > 0.50) score += Math.round(source.yRatio * 60);
    }
  }
  return score;
}

function _maxAnnotationY(textAnnotations) {
  let maxY = 0;
  for (const ann of textAnnotations) {
    const vertices = ann && ann.boundingPoly && ann.boundingPoly.vertices;
    if (!Array.isArray(vertices)) continue;
    for (const v of vertices) {
      if (typeof v.y === 'number') maxY = Math.max(maxY, v.y);
    }
  }
  return maxY || null;
}

function _annotationYRatio(ann, maxY) {
  if (!maxY || !ann || !ann.boundingPoly || !Array.isArray(ann.boundingPoly.vertices)) return null;
  const ys = ann.boundingPoly.vertices.map(v => v && v.y).filter(y => typeof y === 'number');
  if (!ys.length) return null;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return centerY / maxY;
}

export function shouldRun(before, after) {
  if (!after) return false; // photo deleted
  if (after.tag !== 'serial') return false;
  if (!after.storagePath) return false;
  // Fresh tag→serial, or category change, or re-run requested (ocrStatus=null)
  if (!before || before.tag !== 'serial') return true;
  if (before.serialCategory !== after.serialCategory) return true;
  if (after.ocrStatus === null && before.ocrStatus !== null) return true;
  return false;
}

export function shouldCleanup(before, after) {
  if (!before || before.tag !== 'serial') return false;
  if (!after) return true; // photo deleted while tagged
  return after.tag !== 'serial';
}

async function runOcr(buffer) {
  const [result] = await getVisionClient().textDetection({ image: { content: buffer } });
  return result.textAnnotations || [];
}

export async function extractSerialFromQr(buffer) {
  try {
    const [{ default: jpeg }, { default: jsQR }] = await Promise.all([
      import('jpeg-js'),
      import('jsqr'),
    ]);
    const decoded = jpeg.decode(buffer, { useTArray: true });
    const qr = jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
    const data = qr && typeof qr.data === 'string' ? qr.data.trim() : '';
    if (_isSerialCandidate(data)) return data;
    return extractSerialFromOcr([{ description: data }]).value;
  } catch (err) {
    console.warn('QR decode skipped:', err && err.message ? err.message : err);
    return '';
  }
}

function makeEntryId() {
  return 'sn_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function handleOcrSerial(event) {
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  const { projectId, photoId } = event.params;

  if (shouldCleanup(before, after)) {
    await cleanupSerialEntry(projectId, photoId, before.serialEntryId);
    return;
  }
  if (!shouldRun(before, after)) return;

  const projectRef = admin.firestore().collection('projects').doc(projectId);
  const photoRef = projectRef.collection('photos').doc(photoId);
  const bucket = admin.storage().bucket();

  try {
    // Mark pending in case the caller wrote ocrStatus=null (re-run path).
    if (after.ocrStatus !== 'pending') {
      await photoRef.update({ ocrStatus: 'pending', ocrError: admin.firestore.FieldValue.delete() });
    }

    const [buffer] = await bucket.file(after.storagePath).download();
    const qrValue = await extractSerialFromQr(buffer);
    const annotations = qrValue ? [] : await runOcr(buffer);
    const { value, candidates } = qrValue
      ? { value: qrValue, candidates: [qrValue] }
      : extractSerialFromOcr(annotations, { category: after.serialCategory || null });

    await admin.firestore().runTransaction(async (txn) => {
      const projectSnap = await txn.get(projectRef);
      if (!projectSnap.exists) return;
      const data = projectSnap.data();
      const list = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];

      // Idempotency: if a serial-entry already exists for this photo, update it.
      const existingIdx = list.findIndex(e => e && e.photoId === photoId);
      const entryId = existingIdx >= 0 ? list[existingIdx].id : makeEntryId();

      const newEntry = {
        id: entryId,
        value,
        category: after.serialCategory || null,
        source: 'ocr',
        photoId,
        ocrStatus: value ? 'ok' : 'failed',
        uploadedAt: admin.firestore.Timestamp.now(),
        uploadedBy: after.uploadedBy || 'ocr',
      };
      let nextList;
      if (existingIdx >= 0) {
        nextList = list.slice();
        nextList[existingIdx] = newEntry;
      } else {
        nextList = [...list, newEntry];
      }
      txn.update(projectRef, { serialNumbers: nextList });
      txn.update(photoRef, {
        ocrStatus: value ? 'ok' : 'failed',
        ocrCandidates: candidates,
        serialEntryId: entryId,
        ocrError: value ? admin.firestore.FieldValue.delete() : 'no-text-detected',
      });
    });
  } catch (err) {
    console.error('ocrSerial failed', { projectId, photoId, error: err.message });
    try {
      await admin.firestore().runTransaction(async (txn) => {
        const projectSnap = await txn.get(projectRef);
        const list = projectSnap.exists && Array.isArray(projectSnap.data().serialNumbers)
          ? projectSnap.data().serialNumbers
          : [];
        const existingIdx = list.findIndex(e => e && e.photoId === photoId);
        const entryId = existingIdx >= 0 ? list[existingIdx].id : makeEntryId();
        const newEntry = {
          id: entryId,
          value: '',
          category: after.serialCategory || null,
          source: 'ocr',
          photoId,
          ocrStatus: 'failed',
          uploadedAt: admin.firestore.Timestamp.now(),
          uploadedBy: after.uploadedBy || 'ocr',
        };
        let nextList;
        if (existingIdx >= 0) {
          nextList = list.slice();
          nextList[existingIdx] = newEntry;
        } else {
          nextList = [...list, newEntry];
        }
        if (projectSnap.exists) {
          txn.update(projectRef, { serialNumbers: nextList });
        }
        txn.update(photoRef, {
          ocrStatus: 'failed',
          ocrError: String(err.message || err).slice(0, 500),
          serialEntryId: entryId,
        });
      });
    } catch (innerErr) {
      console.error('ocrSerial cleanup-update failed', innerErr);
    }
  }
}

async function cleanupSerialEntry(projectId, photoId, serialEntryId) {
  const projectRef = admin.firestore().collection('projects').doc(projectId);
  const photoRef = projectRef.collection('photos').doc(photoId);
  await admin.firestore().runTransaction(async (txn) => {
    const snap = await txn.get(projectRef);
    if (!snap.exists) return;
    const list = Array.isArray(snap.data().serialNumbers) ? snap.data().serialNumbers : [];
    const next = list.filter(e => e && e.id !== serialEntryId && e.photoId !== photoId);
    txn.update(projectRef, { serialNumbers: next });
  });
  // If the photo still exists (retag situatie), clear the OCR fields.
  // If the photo was deleted, the update will fail — swallow.
  try {
    await photoRef.update({
      serialCategory: admin.firestore.FieldValue.delete(),
      ocrStatus: admin.firestore.FieldValue.delete(),
      serialEntryId: admin.firestore.FieldValue.delete(),
      ocrCandidates: admin.firestore.FieldValue.delete(),
      ocrError: admin.firestore.FieldValue.delete(),
    });
  } catch { /* photo deleted */ }
}

export const ocrSerial = functions.firestore.onDocumentWritten(
  { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
  handleOcrSerial,
);
