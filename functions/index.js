import * as functions from 'firebase-functions/v2';
import {
  SMARTPEAK_TASK_USERS,
  REMINDER_TYPES,
  buildDueDateReminderEmail,
  buildTaskOverviewEmail,
  dueDateReminderTypesForDate,
  hasReminderBeenSent,
  isOpenTask,
  markReminderSent,
  reminderRecipientsForTask,
} from './task-reminders.js';
import { defineSecret } from 'firebase-functions/params';
import admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const billitApiKey = defineSecret('BILLIT_API_KEY');
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
const hostingerSmartpeakKevinPassword = defineSecret('HOSTINGER_SMARTPEAK_KEVIN_PASSWORD');
const BILLIT_BASE_URL = 'https://api.sandbox.billit.be';
const TASKS_URL = 'https://smartpeak-battery-roi.netlify.app/tasks.html';
const WHITELISTED_EMAILS = new Set(['kevin@bloxit.be', 'kevin@smartpeak.be', 'ledsrepair@gmail.com', 'ruben@smartpeak.be']);

const SMARTPEAK_MAILBOX_ACCOUNTS = {
  kevin: {
    email: 'kevin@smartpeak.be',
    host: 'imap.hostinger.com',
    port: 993,
    secure: true,
    passwordSecret: hostingerSmartpeakKevinPassword,
  },
};

const SMARTPEAK_MAILBOX_FOLDERS = {
  inbox: 'INBOX',
  'follow-up': 'INBOX.Opvolgen',
  'to-answer': 'INBOX.Te Beantwoorden',
  review: 'INBOX.Te Bekijken',
  sent: 'INBOX.Sent',
};

const MAILBOX_CACHE_RETENTION_DAYS = 92;
const MAILBOX_SYNC_MAX_PER_FOLDER = 500;
const MAILBOX_CACHE_COLLECTION = 'mailboxCache';

function mailboxRetentionCutoff() {
  return new Date(Date.now() - MAILBOX_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function mailboxFolderKeyForPath(path) {
  const knownFolder = Object.entries(SMARTPEAK_MAILBOX_FOLDERS).find(([, knownPath]) => knownPath === path);
  return knownFolder ? knownFolder[0] : `imap-${Buffer.from(path).toString('base64url')}`;
}

function mailboxFolderLabel(path) {
  return cleanString(String(path || '').replace(/^INBOX\.?/, '') || 'Inbox', 180);
}

function mailboxFolderDoc(accountKey, folderKey) {
  return db.collection(MAILBOX_CACHE_COLLECTION).doc(accountKey).collection('folders').doc(folderKey);
}

function mailboxMessageDoc(accountKey, folderKey, messageId) {
  return mailboxFolderDoc(accountKey, folderKey).collection('messages').doc(String(messageId));
}

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
  if (!after && before.preserveSerialEntry === true) return false;
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
        category: after.serialCategory || 'batterij',
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
          category: after.serialCategory || 'batterij',
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

function projectLabel(project) {
  return cleanString(project.projectName || project.customerName || project.name || project.id || 'Project', 160);
}

function normalizeTaskForMail(project, task) {
  return {
    ...task,
    status: task.status || 'open',
    projectId: project.id,
    projectLabel: projectLabel(project),
  };
}

function mailDocId(parts) {
  return parts.map(part => cleanString(part, 80).replace(/[^a-z0-9_-]+/gi, '_')).join('_').slice(0, 240);
}

async function createMail(db, id, envelope, kind, createdAt) {
  await db.collection('mail').doc(id).set({
    kind,
    to: envelope.to,
    message: envelope.message,
    createdAt,
  }, { merge: false });
}

async function sendDueDateRemindersForProject(db, projectRef, project, today, now) {
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  let changed = false;
  const updatedTasks = [];
  for (const rawTask of tasks) {
    let task = rawTask && typeof rawTask === 'object' ? { ...rawTask } : rawTask;
    if (!task || typeof task !== 'object' || !isOpenTask(task) || !task.dueDate) {
      updatedTasks.push(task);
      continue;
    }
    const reminderTypes = dueDateReminderTypesForDate(today, task.dueDate);
    for (const reminderType of reminderTypes) {
      for (const user of reminderRecipientsForTask(task)) {
        if (hasReminderBeenSent(task, reminderType, user.email, today)) continue;
        const id = mailDocId(['task', projectRef.id, task.id || task.title, reminderType, user.key, today]);
        const envelope = buildDueDateReminderEmail({
          user,
          task: normalizeTaskForMail({ ...project, id: projectRef.id }, task),
          reminderType,
          tasksUrl: TASKS_URL,
        });
        await createMail(db, id, envelope, 'task_due_reminder', now);
        task = markReminderSent(task, reminderType, user.email, today, id);
        changed = true;
      }
    }
    updatedTasks.push(task);
  }
  if (changed) {
    await projectRef.update({ tasks: updatedTasks, updatedAt: now });
  }
}

async function sendWeeklyTaskOverview(db, projects, user, today, now) {
  const assignedTasks = [];
  const generalTasks = [];
  const touched = [];
  for (const item of projects) {
    const tasks = Array.isArray(item.project.tasks) ? item.project.tasks : [];
    const nextTasks = [];
    let changed = false;
    for (const rawTask of tasks) {
      let task = rawTask && typeof rawTask === 'object' ? { ...rawTask } : rawTask;
      if (!task || typeof task !== 'object' || !isOpenTask(task)) {
        nextTasks.push(task);
        continue;
      }
      const normalized = normalizeTaskForMail({ ...item.project, id: item.ref.id }, task);
      if (task.assignee === user.key) assignedTasks.push(normalized);
      if (!task.assignee) generalTasks.push(normalized);
      if ((task.assignee === user.key || !task.assignee) && !hasReminderBeenSent(task, REMINDER_TYPES.WEEKLY_OVERVIEW, user.email, today)) {
        const mailId = mailDocId(['weekly', user.key, today]);
        task = markReminderSent(task, REMINDER_TYPES.WEEKLY_OVERVIEW, user.email, today, mailId);
        changed = true;
      }
      nextTasks.push(task);
    }
    if (changed) touched.push({ ref: item.ref, tasks: nextTasks });
  }
  if (!assignedTasks.length && !generalTasks.length) return;
  const id = mailDocId(['weekly', user.key, today]);
  const envelope = buildTaskOverviewEmail({ user, assignedTasks, generalTasks, tasksUrl: TASKS_URL });
  await createMail(db, id, envelope, 'task_weekly_overview', now);
  await Promise.all(touched.map(item => item.ref.update({ tasks: item.tasks, updatedAt: now })));
}

export async function runTaskReminderJob(today = new Date().toISOString().slice(0, 10)) {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection('projects').get();
  const projects = snap.docs
    .map(refSnap => ({ ref: refSnap.ref, project: refSnap.data() || {} }))
    .filter(item => !item.project.deletedAt);

  await Promise.all(projects.map(item => sendDueDateRemindersForProject(db, item.ref, item.project, today, now)));

  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (day === 0) {
    for (const user of SMARTPEAK_TASK_USERS) {
      await sendWeeklyTaskOverview(db, projects, user, today, now);
    }
  }
}

export const taskRemindersDaily = functions.scheduler.onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Europe/Brussels', region: 'europe-west1' },
  async () => runTaskReminderJob(),
);

export const ocrSerial = functions.firestore.onDocumentWritten(
  { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
  handleOcrSerial,
);

function setCors(req, res) {
  const origin = req.get('origin') || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function requireWhitelistedUser(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error('Missing Firebase auth token');
    err.status = 401;
    throw err;
  }
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (!WHITELISTED_EMAILS.has(decoded.email || '')) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return decoded;
}

function cleanString(value, max = 4000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanMailboxKey(value) {
  return cleanString(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanMailboxFolder(value) {
  return cleanString(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanMailboxFolderPath(value) {
  return cleanString(value, 300).replace(/[\r\n\0]/g, '');
}

function addressListText(addresses = []) {
  return (Array.isArray(addresses) ? addresses : [])
    .map(address => {
      if (!address) return '';
      const name = cleanString(address.name || '', 120);
      const addr = cleanString(address.address || '', 180);
      if (name && addr) return `${name} <${addr}>`;
      return name || addr;
    })
    .filter(Boolean)
    .join(', ');
}

function formatMailboxDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function cleanMailboxBody(value, max = 12000) {
  return cleanString(value || '', max);
}

async function parseMailboxSource(source) {
  if (!source) return { text: '', preview: '' };
  const parsed = await simpleParser(source, { skipImageLinks: true, skipHtmlToText: false });
  const text = cleanMailboxBody(parsed.text || parsed.textAsHtml || '');
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 280);
  const html = sanitizeMailboxHtml(parsed.html || parsed.textAsHtml || '');
  return { text, preview, html };
}

function sanitizeMailboxHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
      'span', 'div', 'center', 'font', 'hr', 'br', 'p', 'h1', 'h2', 'h3', 'h4',
    ]),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      table: ['width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'bgcolor'],
      td: ['width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'bgcolor'],
      th: ['width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'bgcolor'],
      div: ['align'],
      p: ['align'],
      span: [],
      font: ['color', 'face', 'size'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
        'font-size': [/^\d+(?:px|em|rem|%)$/],
        'font-family': [/^[a-z0-9 ,.'"-]+$/i],
        'font-weight': [/^\d+$/, /^(bold|normal)$/],
        'font-style': [/^(italic|normal)$/],
        'text-align': [/^(left|right|center|justify)$/],
        'text-decoration': [/^(none|underline)$/],
        'line-height': [/^\d+(?:\.\d+)?(?:px|em|rem|%)?$/],
        width: [/^\d+(?:px|%)$/],
        height: [/^\d+(?:px|%)$/],
        margin: [/^[0-9px emrem%.-]+$/],
        padding: [/^[0-9px emrem%.-]+$/],
        border: [/^[#a-z0-9 ,.()%-]+$/i],
        'border-radius': [/^\d+(?:px|%)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

async function normalizeImapMessage(message, accountKey, folderKey) {
  const envelope = message.envelope || {};
  const flags = Array.isArray(message.flags) ? message.flags : [...(message.flags || [])];
  const body = await parseMailboxSource(message.source);
  return {
    id: String(message.uid || message.seq || ''),
    uid: message.uid || null,
    mailboxKey: accountKey,
    folderKey,
    from: addressListText(envelope.from),
    to: addressListText(envelope.to),
    subject: cleanString(envelope.subject || '(geen onderwerp)', 500),
    preview: body.preview,
    body: body.text,
    bodyHtml: body.html,
    date: formatMailboxDate(envelope.date || message.internalDate),
    unread: !flags.includes('\\Seen'),
    flagged: flags.includes('\\Flagged'),
  };
}

async function listHostingerMessages({ accountKey, folderKey, folderPath: requestedFolderPath, limit, since }) {
  const account = SMARTPEAK_MAILBOX_ACCOUNTS[accountKey];
  if (!account) return [];
  const folderPath = cleanMailboxFolderPath(requestedFolderPath) || SMARTPEAK_MAILBOX_FOLDERS[folderKey] || SMARTPEAK_MAILBOX_FOLDERS.inbox;
  const password = account.passwordSecret.value();
  if (!password) throw new Error(`Mailbox secret ontbreekt voor ${accountKey}`);
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.email, pass: password },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock(folderPath);
  try {
    const searchQuery = since ? { since } : { all: true };
    const uids = await client.search(searchQuery, { uid: true });
    const selected = uids.slice(-limit).reverse();
    if (!selected.length) return [];
    const rows = [];
    for await (const message of client.fetch(selected, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      source: true,
    }, { uid: true })) {
      rows.push(await normalizeImapMessage(message, accountKey, folderKey));
    }
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

async function listHostingerFolders({ accountKey }) {
  const account = SMARTPEAK_MAILBOX_ACCOUNTS[accountKey];
  if (!account) return [];
  const password = account.passwordSecret.value();
  if (!password) throw new Error(`Mailbox secret ontbreekt voor ${accountKey}`);
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.email, pass: password },
    logger: false,
  });
  await client.connect();
  try {
    const boxes = await client.list();
    return normalizeHostingerFolders(boxes);
  } finally {
    await client.logout().catch(() => {});
  }
}

function normalizeHostingerFolders(boxes = []) {
  return boxes
    .filter(box => box && box.path && !box.flags?.has?.('\\Noselect'))
    .map(box => ({
      key: mailboxFolderKeyForPath(box.path),
      label: mailboxFolderLabel(box.path),
      providerFolder: cleanMailboxFolderPath(box.path),
      specialUse: box.specialUse || '',
    }));
}

async function upsertMailboxFolders(accountKey, folders = []) {
  const writer = db.bulkWriter();
  for (const folder of folders) {
    writer.set(mailboxFolderDoc(accountKey, folder.key), {
      ...folder,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
}

async function listCachedFolders({ accountKey }) {
  const snap = await db.collection(MAILBOX_CACHE_COLLECTION).doc(accountKey).collection('folders').orderBy('label').get();
  return snap.docs.map(doc => ({ key: doc.id, ...doc.data() }));
}

function serializeMailboxMessageForCache(message, folder) {
  const date = message.date ? new Date(message.date) : new Date();
  return {
    ...message,
    id: `${folder.key}-${message.uid || message.id}`,
    cacheId: `${folder.key}-${message.uid || message.id}`,
    providerUid: message.uid || null,
    folderKey: folder.key,
    folderLabel: folder.label,
    providerFolder: folder.providerFolder,
    dateTs: admin.firestore.Timestamp.fromDate(Number.isNaN(date.getTime()) ? new Date() : date),
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(mailboxRetentionCutoff()),
  };
}

async function storeMailboxMessages(accountKey, folder, messages = []) {
  if (!messages.length) return 0;
  const writer = db.bulkWriter();
  for (const message of messages) {
    const cached = serializeMailboxMessageForCache(message, folder);
    writer.set(mailboxMessageDoc(accountKey, folder.key, cached.cacheId), cached, { merge: true });
  }
  await writer.close();
  return messages.length;
}

async function listCachedMessages({ accountKey, folderKey, limit }) {
  const folders = folderKey === 'all'
    ? await listCachedFolders({ accountKey })
    : [{ key: folderKey }];
  const rows = [];
  for (const folder of folders) {
    const snap = await mailboxFolderDoc(accountKey, folder.key)
      .collection('messages')
      .orderBy('dateTs', 'desc')
      .limit(Math.max(1, Math.min(100, limit || 50)))
      .get();
    rows.push(...snap.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date || doc.data().dateTs?.toDate?.().toISOString?.() || '' })));
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, Math.max(1, Math.min(500, (limit || 50) * Math.max(1, folders.length))));
}

async function getCachedMessage({ accountKey, folderKey, messageId }) {
  const safeMessageId = cleanString(messageId, 240);
  if (!safeMessageId) return null;
  const folderKeys = folderKey === 'all'
    ? (await listCachedFolders({ accountKey })).map(folder => folder.key)
    : [folderKey];
  for (const key of folderKeys) {
    const snap = await mailboxMessageDoc(accountKey, key, safeMessageId).get();
    if (snap.exists) {
      const data = snap.data();
      return { id: snap.id, ...data, date: data.date || data.dateTs?.toDate?.().toISOString?.() || '' };
    }
  }
  return null;
}

function mailboxDirectionForFolder(folderKey = '') {
  return String(folderKey || '').toLowerCase().includes('sent') ? 'sent' : 'received';
}

function extractMailboxEmails(value = '') {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])];
}

function normalizeMatchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function projectMailboxMatchKeys(project = {}) {
  const customer = project.customer && typeof project.customer === 'object' ? project.customer : {};
  const emailKeys = [customer.email, customer.contactEmail, project.email]
    .flatMap(extractMailboxEmails);
  const nameKeys = [project.customerName, project.projectName, customer.name]
    .map(normalizeMatchText)
    .filter(value => value.length >= 6 && value.split(' ').filter(Boolean).length >= 2);
  const address = normalizeMatchText(customer.address || '');
  const addressKeys = address.length >= 8 ? [address] : [];
  return {
    projectId: project.id,
    emailKeys: [...new Set(emailKeys)],
    nameKeys: [...new Set(nameKeys)],
    addressKeys,
  };
}

function mailboxMessageMatchesProject(message = {}, keys = {}) {
  const participants = extractMailboxEmails(`${message.from || ''} ${message.to || ''}`);
  if (keys.emailKeys && keys.emailKeys.some(email => participants.includes(email))) return true;
  const headerText = normalizeMatchText(`${message.from || ''} ${message.to || ''} ${message.subject || ''}`);
  if (keys.nameKeys && keys.nameKeys.some(name => headerText.includes(name))) return true;
  const previewText = normalizeMatchText(`${message.subject || ''} ${message.preview || ''}`);
  return keys.addressKeys && keys.addressKeys.some(address => previewText.includes(address));
}

function projectMailLinkFromMessage(message = {}) {
  const folderKey = message.folderKey || 'inbox';
  const direction = mailboxDirectionForFolder(folderKey);
  const messageId = String(message.cacheId || message.id || `${folderKey}-${message.uid || ''}`);
  return {
    messageId,
    cacheId: messageId,
    mailboxKey: message.mailboxKey || 'kevin',
    mailboxLabel: message.mailboxLabel || 'Kevin',
    folderKey,
    folderLabel: message.folderLabel || mailboxFolderLabel(message.providerFolder || folderKey),
    direction,
    subject: cleanString(message.subject || '(geen onderwerp)', 500),
    date: message.date || message.dateTs?.toDate?.().toISOString?.() || '',
    dateLabel: message.date || message.dateTs?.toDate?.().toISOString?.() || '',
    linkedAt: new Date().toISOString(),
  };
}

async function listCachedMessagesForProjectLinking({ accountKey, folderKey = 'all' }) {
  const folders = folderKey === 'all'
    ? await listCachedFolders({ accountKey })
    : [{ key: folderKey }];
  const rows = [];
  for (const folder of folders) {
    const snap = await mailboxFolderDoc(accountKey, folder.key)
      .collection('messages')
      .orderBy('dateTs', 'desc')
      .limit(MAILBOX_SYNC_MAX_PER_FOLDER)
      .get();
    rows.push(...snap.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date || doc.data().dateTs?.toDate?.().toISOString?.() || '' })));
  }
  return rows;
}

async function linkMailboxCacheToProjects({ accountKey = 'kevin', folderKey = 'all' } = {}) {
  const [messages, projectSnap] = await Promise.all([
    listCachedMessagesForProjectLinking({ accountKey, folderKey }),
    db.collection('projects').where('deletedAt', '==', null).get(),
  ]);
  const projects = projectSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const projectKeys = projects.map(projectMailboxMatchKeys)
    .filter(keys => keys.emailKeys.length || keys.nameKeys.length || keys.addressKeys.length);
  const updates = [];
  for (const project of projects) {
    const keys = projectKeys.find(item => item.projectId === project.id);
    if (!keys) continue;
    const existing = Array.isArray(project.mailLinks) ? project.mailLinks : [];
    const byId = new Map(existing.map(link => [String(link.messageId || link.cacheId || link.id || ''), link]));
    let added = 0;
    for (const message of messages) {
      if (!mailboxMessageMatchesProject(message, keys)) continue;
      const link = projectMailLinkFromMessage(message);
      if (!link.messageId || byId.has(link.messageId)) continue;
      byId.set(link.messageId, link);
      added += 1;
    }
    if (!added) continue;
    const mailLinks = [...byId.values()]
      .sort((a, b) => String(b.date || b.dateLabel).localeCompare(String(a.date || a.dateLabel)))
      .slice(0, 100);
    updates.push({ projectId: project.id, mailLinks, added });
  }
  const writer = db.bulkWriter();
  for (const update of updates) {
    writer.update(db.collection('projects').doc(update.projectId), {
      mailLinks: update.mailLinks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
  return {
    accountKey,
    folderKey,
    scannedMessages: messages.length,
    scannedProjects: projects.length,
    linkedProjects: updates.length,
    linkedMessages: updates.reduce((sum, item) => sum + item.added, 0),
  };
}

async function cleanupMailboxCache(accountKey) {
  const cutoff = admin.firestore.Timestamp.fromDate(mailboxRetentionCutoff());
  const folders = await listCachedFolders({ accountKey });
  let deleted = 0;
  for (const folder of folders) {
    const snap = await mailboxFolderDoc(accountKey, folder.key).collection('messages').where('dateTs', '<', cutoff).limit(500).get();
    if (snap.empty) continue;
    const writer = db.bulkWriter();
    snap.docs.forEach(doc => writer.delete(doc.ref));
    await writer.close();
    deleted += snap.size;
  }
  return deleted;
}

async function syncMailboxCache({ accountKey = 'kevin', folderKey = 'all', mode = 'recent' } = {}) {
  const folders = await listHostingerFolders({ accountKey });
  await upsertMailboxFolders(accountKey, folders);
  const selectedFolders = folderKey === 'all' ? folders : folders.filter(folder => folder.key === folderKey);
  const cutoff = mailboxRetentionCutoff();
  const results = [];
  for (const folder of selectedFolders) {
    const messages = await listHostingerMessages({
      accountKey,
      folderKey: folder.key,
      folderPath: folder.providerFolder,
      limit: mode === 'all' ? MAILBOX_SYNC_MAX_PER_FOLDER : 75,
      since: cutoff,
    });
    const stored = await storeMailboxMessages(accountKey, folder, messages);
    results.push({ folderKey: folder.key, label: folder.label, stored });
  }
  const deleted = await cleanupMailboxCache(accountKey);
  return { accountKey, folderCount: selectedFolders.length, stored: results.reduce((sum, item) => sum + item.stored, 0), deleted, results };
}

function cleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeBillitOrder(input) {
  const source = Array.isArray(input) ? input[0] : input;
  if (!source || typeof source !== 'object') throw new Error('Invalid Billit order payload');
  const customer = source.Customer && typeof source.Customer === 'object' ? source.Customer : {};
  const lines = Array.isArray(source.OrderLines) ? source.OrderLines : [];
  if (!cleanString(customer.Name, 200)) throw new Error('Customer.Name is required');
  if (!lines.length) throw new Error('At least one OrderLine is required');

  return {
    IsSent: false,
    OrderType: 'Offer',
    OrderDirection: 'Income',
    OrderDate: cleanString(source.OrderDate, 10),
    ExpiryDate: cleanString(source.ExpiryDate, 10),
    Description: cleanString(source.Description, 500),
    OrderTitle: cleanString(source.OrderTitle, 500),
    InternalInfo: cleanString(source.InternalInfo, 2000),
    Customer: {
      Name: cleanString(customer.Name, 200),
      Street: cleanString(customer.Street, 250),
      City: cleanString(customer.City, 120),
      Zipcode: cleanString(customer.Zipcode, 40),
      CountryCode: cleanString(customer.CountryCode || 'BE', 2),
      Email: cleanString(customer.Email, 254),
      Phone: cleanString(customer.Phone, 80),
    },
    OrderLines: lines.map(line => ({
      Quantity: cleanNumber(line.Quantity, 1),
      UnitPriceExcl: cleanNumber(line.UnitPriceExcl, 0),
      Description: cleanString(line.Description, 4000),
      VATPercentage: cleanNumber(line.VATPercentage, 21),
      AccountCode: cleanNumber(line.AccountCode, 700010),
      ...(line.CustomFields && typeof line.CustomFields === 'object' ? { CustomFields: line.CustomFields } : {}),
    })).filter(line => line.Description && line.Quantity > 0),
    AccountCode: cleanNumber(source.AccountCode, 700010),
    Reference: cleanString(source.Reference, 200),
    Comments: cleanString(source.Comments, 4000),
    Currency: cleanString(source.Currency || 'EUR', 3),
  };
}

async function postBillitOrder(order, apiKey, wrapArray = false, authMode = 'apiKey-header') {
  const headers = billitHeaders(apiKey);
  if (authMode !== 'apiKey-header') {
    delete headers.apiKey;
    headers.Authorization = `${authMode} ${apiKey}`;
  }
  const response = await fetch(`${BILLIT_BASE_URL}/v1/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(wrapArray ? [order] : order),
  });
  return readBillitResponse(response);
}

function billitHeaders(apiKey) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    apiKey,
  };
}

async function readBillitResponse(response) {
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* Billit may return plain text */ }
  return { ok: response.ok, status: response.status, data };
}

async function createBillitOrder(order, apiKey) {
  let billit = await postBillitOrder(order, apiKey, false, 'apiKey-header');
  if (!billit.ok && [401, 403].includes(billit.status)) {
    billit = await postBillitOrder(order, apiKey, false, 'api-key');
  }
  if (!billit.ok && [401, 403].includes(billit.status)) {
    billit = await postBillitOrder(order, apiKey, false, 'Bearer');
  }
  if (!billit.ok && billit.status === 400) {
    billit = await postBillitOrder(order, apiKey, true, 'apiKey-header');
    if (!billit.ok && [401, 403].includes(billit.status)) {
      billit = await postBillitOrder(order, apiKey, true, 'api-key');
    }
    if (!billit.ok && [401, 403].includes(billit.status)) {
      billit = await postBillitOrder(order, apiKey, true, 'Bearer');
    }
  }
  return billit;
}

function extractBillitOrderId(data) {
  if (Number.isFinite(Number(data))) return Number(data);
  if (!data || typeof data !== 'object') return null;
  return Number(data.OrderID || data.OrderId || data.ID || data.Id || data.id) || null;
}

async function getBillitOrder(orderId, apiKey) {
  const response = await fetch(`${BILLIT_BASE_URL}/v1/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: billitHeaders(apiKey),
  });
  return readBillitResponse(response);
}

async function getBillitFile(fileId, apiKey) {
  const response = await fetch(`${BILLIT_BASE_URL}/v1/files/${encodeURIComponent(fileId)}`, {
    method: 'GET',
    headers: billitHeaders(apiKey),
  });
  return readBillitResponse(response);
}

function normalizeBillitPdf(file) {
  if (!file || typeof file !== 'object' || !file.FileContent) return null;
  return {
    fileName: cleanString(file.FileName || 'billit-offerte.pdf', 180) || 'billit-offerte.pdf',
    mimeType: cleanString(file.MimeType || 'application/pdf', 80) || 'application/pdf',
    fileContent: file.FileContent,
  };
}

async function getBillitPdf(orderId, apiKey) {
  const order = await getBillitOrder(orderId, apiKey);
  if (!order.ok) {
    if ([400, 404].includes(order.status)) return { ready: false, status: order.status };
    return { ready: false, errorStatus: order.status, details: order.data };
  }
  const pdf = order.data && order.data.OrderPDF;
  const inlinePdf = normalizeBillitPdf(pdf);
  if (inlinePdf) return { ready: true, file: inlinePdf };
  const fileId = pdf && (pdf.FileID || pdf.FileId || pdf.fileID || pdf.id);
  if (!fileId) return { ready: false, status: 202 };
  const file = await getBillitFile(fileId, apiKey);
  if (!file.ok) {
    if ([400, 404].includes(file.status)) return { ready: false, status: file.status };
    return { ready: false, errorStatus: file.status, details: file.data };
  }
  const fetchedPdf = normalizeBillitPdf(file.data);
  return fetchedPdf ? { ready: true, file: fetchedPdf } : { ready: false, status: 202 };
}

export const createBillitOffer = functions.https.onRequest(
  { region: 'europe-west1', secrets: [billitApiKey] },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      await requireWhitelistedUser(req);
      const apiKey = billitApiKey.value().trim();
      if (!apiKey) throw new Error('BILLIT_API_KEY secret is not configured');
      if (req.body && req.body.action === 'pdf-status') {
        const orderId = Number(req.body.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) throw new Error('Valid orderId is required');
        const pdf = await getBillitPdf(orderId, apiKey);
        if (pdf.errorStatus) {
          res.status(502).json({ error: 'Billit PDF request failed', status: pdf.errorStatus, details: pdf.details });
          return;
        }
        res.json(pdf);
        return;
      }
      const order = sanitizeBillitOrder(req.body && req.body.order);
      const billit = await createBillitOrder(order, apiKey);
      if (!billit.ok) {
        res.status(502).json({ error: 'Billit request failed', status: billit.status, details: billit.data });
        return;
      }
      res.json({ ok: true, billit: billit.data, orderId: extractBillitOrderId(billit.data), order });
    } catch (err) {
      const status = err.status || 400;
      res.status(status).json({ error: err.message || String(err) });
    }
  },
);

export const mailboxSyncScheduled = functions.scheduler.onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Europe/Brussels', region: 'europe-west1', secrets: [hostingerSmartpeakKevinPassword], timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    await syncMailboxCache({ accountKey: 'kevin', folderKey: 'all', mode: 'recent' });
    await linkMailboxCacheToProjects({ accountKey: 'kevin', folderKey: 'all' });
  },
);

export const mailboxListMessages = functions.https.onRequest(
  { region: 'europe-west1', secrets: [hostingerSmartpeakKevinPassword], timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      await requireWhitelistedUser(req);
      const accountKey = cleanMailboxKey(req.body && req.body.accountKey || '');
      if (req.body && req.body.action === 'sync') {
        const folderKey = cleanMailboxFolder(req.body && req.body.folderKey || 'all') || 'all';
        const mode = cleanString(req.body.mode || 'recent', 20) === 'all' ? 'all' : 'recent';
        const result = await syncMailboxCache({ accountKey, folderKey, mode });
        const linked = await linkMailboxCacheToProjects({ accountKey, folderKey });
        res.json({ ok: true, ...result, linked });
        return;
      }
      if (req.body && req.body.action === 'linkProjects') {
        const folderKey = cleanMailboxFolder(req.body && req.body.folderKey || 'all') || 'all';
        const result = await linkMailboxCacheToProjects({ accountKey, folderKey });
        res.json({ ok: true, ...result });
        return;
      }
      if (req.body && req.body.action === 'getMessage') {
        const folderKey = cleanMailboxFolder(req.body && req.body.folderKey || 'inbox') || 'inbox';
        const messageId = cleanString(req.body && req.body.messageId || '', 240);
        const message = await getCachedMessage({ accountKey, folderKey, messageId });
        if (!message) {
          res.status(404).json({ error: 'Mail niet gevonden in cache.' });
          return;
        }
        res.json({ ok: true, cached: true, message });
        return;
      }
      if (req.body && req.body.action === 'folders') {
        let folders = await listCachedFolders({ accountKey });
        if (!folders.length || req.body.refresh === true) {
          folders = await listHostingerFolders({ accountKey });
          await upsertMailboxFolders(accountKey, folders);
        }
        res.json({ ok: true, folders });
        return;
      }
      const folderKey = cleanMailboxFolder(req.body && req.body.folderKey || 'inbox') || 'inbox';
      const folderPath = cleanMailboxFolderPath(req.body && req.body.folderPath || '');
      const limit = Math.min(100, Math.max(1, cleanNumber(req.body && req.body.limit, 50)));
      let messages = await listCachedMessages({ accountKey, folderKey, limit });
      if (!messages.length) {
        const folder = folderPath ? { key: folderKey, label: mailboxFolderLabel(folderPath), providerFolder: folderPath } : null;
        if (folder) {
          const liveMessages = await listHostingerMessages({ accountKey, folderKey, folderPath, limit, since: mailboxRetentionCutoff() });
          await storeMailboxMessages(accountKey, folder, liveMessages);
        } else {
          await syncMailboxCache({ accountKey, folderKey, mode: 'recent' });
        }
        messages = await listCachedMessages({ accountKey, folderKey, limit });
      }
      res.json({ ok: true, cached: true, messages });
    } catch (err) {
      const status = err.status || 400;
      res.status(status).json({ error: err.message || String(err) });
    }
  },
);

export const getGoogleMapsApiKey = functions.https.onRequest(
  { region: 'europe-west1', secrets: [googleMapsApiKey] },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      await requireWhitelistedUser(req);
      const apiKey = googleMapsApiKey.value().trim();
      if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY secret is not configured');
      res.json({ apiKey });
    } catch (err) {
      const status = err.status || 400;
      res.status(status).json({ error: err.message || String(err) });
    }
  },
);
