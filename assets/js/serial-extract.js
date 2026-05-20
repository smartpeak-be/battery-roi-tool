// Shared serial-extraction heuristic — pure function.
// Used by the client (no callers yet, future re-run UX) and by the
// Cloud Function `ocrSerial`. Dual-target: ES module + window-global.
//
// Each Vision `textAnnotation.description` is tokenized on any character
// that is NOT in the serial-alphabet `[A-Z0-9-]` (case-insensitive). This
// naturally handles both the multi-line "full text" first entry (newlines
// + spaces split it into the same tokens the per-block entries already
// expose) and per-block entries that contain prefixes like "SN: ".

const SERIAL_REGEX = /^[A-Z0-9-]{6,}$/i;
// Anything that is NOT an ASCII letter/digit/hyphen is a token separator.
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

/**
 * Pick the most-likely serial number from a Vision textDetection result.
 *
 * @param {Array<{description: string}> | null | undefined} textAnnotations
 *   Google Cloud Vision `textAnnotations` array. The first entry is the
 *   full-text dump (multi-line); per-block entries follow.
 * @returns {{ value: string, candidates: string[] }}
 *   `value` is the chosen serial (empty string if no match). `candidates`
 *   is every distinct token (across all annotations) that matched the
 *   serial regex, in first-occurrence order.
 */
export function extractSerialFromOcr(textAnnotations, opts = {}) {
  if (!Array.isArray(textAnnotations) || textAnnotations.length === 0) {
    return { value: '', candidates: [] };
  }
  const seen = new Set();
  const candidateMap = new Map();
  const candidates = [];
  const imageMaxY = _maxAnnotationY(textAnnotations);

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

if (typeof window !== 'undefined') {
  window.extractSerialFromOcr = extractSerialFromOcr;
}
