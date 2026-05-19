import * as functions from 'firebase-functions/v2';
import admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';

if (!admin.apps.length) admin.initializeApp();

// Vision client — singleton, EU endpoint.
const visionClient = new ImageAnnotatorClient({ apiEndpoint: 'eu-vision.googleapis.com' });

// Mirrors assets/js/serial-extract.js exactly. If this diverges, the
// browser and server will pick different serials from the same photo.
const SERIAL_REGEX = /^[A-Z0-9-]{6,}$/i;
const TOKEN_SPLIT = /[^A-Za-z0-9-]+/;
export function extractSerialFromOcr(textAnnotations) {
  if (!Array.isArray(textAnnotations) || textAnnotations.length === 0) {
    return { value: '', candidates: [] };
  }
  const seen = new Set();
  const candidates = [];
  for (const ann of textAnnotations) {
    const desc = (ann && typeof ann.description === 'string') ? ann.description : '';
    if (!desc) continue;
    for (const tok of desc.split(TOKEN_SPLIT)) {
      if (!tok) continue;
      if (!SERIAL_REGEX.test(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      candidates.push(tok);
    }
  }
  if (candidates.length === 0) return { value: '', candidates: [] };
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  return { value: sorted[0], candidates };
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
  const [result] = await visionClient.textDetection({ image: { content: buffer } });
  return result.textAnnotations || [];
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
    const annotations = await runOcr(buffer);
    const { value, candidates } = extractSerialFromOcr(annotations);

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
      await photoRef.update({
        ocrStatus: 'failed',
        ocrError: String(err.message || err).slice(0, 500),
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
  } catch (_) { /* photo deleted */ }
}

export const ocrSerial = functions.firestore.onDocumentWritten(
  { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
  handleOcrSerial,
);
