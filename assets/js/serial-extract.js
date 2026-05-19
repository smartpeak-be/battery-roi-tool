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
  // Pick the longest; ties broken by first-occurrence (stable sort).
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  return { value: sorted[0], candidates };
}

if (typeof window !== 'undefined') {
  window.extractSerialFromOcr = extractSerialFromOcr;
}
