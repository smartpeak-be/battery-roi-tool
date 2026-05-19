# Serial-OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3-category serial-tagging to the photo-uploader and an async Cloud Function that runs Cloud Vision OCR on serial-tagged photos and writes detected serial numbers to `project.serialNumbers`.

**Architecture:** Tag-modal in `photo-uploader.js` writes `tag='serial' + serialCategory + ocrStatus='pending'` to the photo-doc. A new Firestore-trigger Cloud Function (`functions/index.js`) reacts to that write, calls Cloud Vision (EU endpoint, ADC creds — no key in client), and appends an entry to `project.serialNumbers` via transaction. Blok D in `project-edit.html` and the drawer in `dashboard.html` subscribe with `onSnapshot` and render pending → ok / failed states with badges, source icons, and a re-run button.

**Tech Stack:** Firebase compat SDK 10.13.2 (browser), Firebase Admin SDK + `@google-cloud/vision` (functions), vitest (unit), Playwright (E2E), Bootstrap 5.3.3 + FA 6.5.2 (UI). Node 20 runtime for the function.

**Branch:** `feat/serial-ocr` (already checked out, base `gh-pages`).

**Spec:** `docs/superpowers/specs/2026-05-19-serial-ocr-design.md`

---

## File Structure

**Created:**
- `assets/js/serial-extract.js` — pure helper `extractSerialFromOcr(textAnnotations)`. Dual-target ES module + window-global (same UMD pattern as `csv.js`).
- `tests/serial-ocr-extract.test.js` — vitest unit tests for the heuristic.
- `tests/firebase-init-serials.test.js` — vitest unit tests for `mergeProjectMetadata` serial-defaults + new helpers.
- `functions/package.json`, `functions/index.js`, `functions/.gitignore`, `functions/.eslintrc.json` — Cloud Function package.
- `functions/__tests__/ocrSerial.test.js` — vitest tests for the function (Vision mocked).
- `firebase.json` (top-level) — Firebase CLI config so `firebase deploy --only functions:ocrSerial` works; only `functions` section, leaves Firestore/Storage rules paths intact if already present.
- `e2e/tests/serial-ocr.spec.js` — Playwright happy-path + failure-path.

**Modified:**
- `assets/js/firebase-init.js` — extend `mergeProjectMetadata`, add `setPhotoSerialTag`, `unsetPhotoSerialTag`, `requestPhotoOcrRerun`.
- `assets/js/photo-uploader.js` — tag-modal 2-level radio + save-flow writes serialCategory/ocrStatus.
- `project-edit.html` — serial-list rendering refactor (badges, status icons, re-run knop) + onSnapshot subscription.
- `dashboard.html` — drawer serial-list rendering refactor mirroring project-edit.
- `CLAUDE.md` — add "Serial-OCR pipeline" section and reference to `functions/` directory.

**Notes on shared file boundaries:** `serial-extract.js` is the only piece that runs in BOTH browser and Cloud Function. Everywhere else, browser-only modules stay in `assets/js/` and function-only modules stay in `functions/`. We do not introduce a build step.

---

## Task 1: Pure helper `extractSerialFromOcr`

**Files:**
- Create: `assets/js/serial-extract.js`
- Test: `tests/serial-ocr-extract.test.js`

- [ ] **Step 1: Write failing tests**

`tests/serial-ocr-extract.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { extractSerialFromOcr } from '../assets/js/serial-extract.js';

describe('extractSerialFromOcr', () => {
  it('returns empty result when annotations are empty', () => {
    const r = extractSerialFromOcr([]);
    expect(r.value).toBe('');
    expect(r.candidates).toEqual([]);
  });

  it('returns empty result when annotations are null/undefined', () => {
    expect(extractSerialFromOcr(null).value).toBe('');
    expect(extractSerialFromOcr(undefined).value).toBe('');
  });

  it('picks the longest alphanumeric token ≥ 6 chars', () => {
    const annotations = [
      { description: 'MODEL X1' },
      { description: 'SN: ABCD12345678' },
      { description: '2024-03-15' },
    ];
    const r = extractSerialFromOcr(annotations);
    expect(r.value).toBe('ABCD12345678');
    expect(r.candidates).toContain('ABCD12345678');
  });

  it('skips Vision full-text first entry (multi-line description)', () => {
    const annotations = [
      { description: 'MODEL X1\nSN: SHORTID\nDATE 2024' },
      { description: 'MODEL' },
      { description: 'X1' },
      { description: 'SN' },
      { description: 'SHORTID' },
    ];
    const r = extractSerialFromOcr(annotations);
    expect(r.value).toBe('SHORTID');
  });

  it('accepts hyphenated alphanumerics', () => {
    const annotations = [
      { description: 'MARSTEK-AB-12-34-56' },
      { description: 'OTHER' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('MARSTEK-AB-12-34-56');
  });

  it('rejects pure words shorter than 6 chars', () => {
    const annotations = [
      { description: 'MODEL' },
      { description: 'TYPE' },
      { description: 'ABC' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('');
  });

  it('prefers longer over shorter when multiple match', () => {
    const annotations = [
      { description: 'SHORT12' },
      { description: 'MUCHLONGER1234567' },
      { description: 'MID12345' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('MUCHLONGER1234567');
  });

  it('case-insensitive regex but preserves original casing', () => {
    const annotations = [
      { description: 'aBcD1234ef' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('aBcD1234ef');
  });

  it('stores all candidates that matched, not just the winner', () => {
    const annotations = [
      { description: 'AAAAAA1' },
      { description: 'BBBBBB22' },
      { description: 'CCCC333' },
    ];
    const r = extractSerialFromOcr(annotations);
    expect(r.candidates.sort()).toEqual(['AAAAAA1', 'BBBBBB22', 'CCCC333'].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/serial-ocr-extract.test.js`
Expected: FAIL — module not found / function not defined.

- [ ] **Step 3: Implement `assets/js/serial-extract.js`**

```javascript
// Shared serial-extraction heuristic — pure function.
// Used by the client (no callers yet, future re-run UX) and by the
// Cloud Function `ocrSerial`. Dual-target: ES module + window-global.

const SERIAL_REGEX = /^[A-Z0-9-]{6,}$/i;

/**
 * Pick the most-likely serial number from a Vision textDetection result.
 *
 * @param {Array<{description: string}> | null | undefined} textAnnotations
 *   Google Cloud Vision `textAnnotations` array. The first entry is the
 *   full-text dump (multi-line); per-block entries follow.
 * @returns {{ value: string, candidates: string[] }}
 *   `value` is the chosen serial (empty string if no match). `candidates`
 *   is every per-block description that matched the regex.
 */
export function extractSerialFromOcr(textAnnotations) {
  if (!Array.isArray(textAnnotations) || textAnnotations.length === 0) {
    return { value: '', candidates: [] };
  }
  // Skip the first "full text" entry which contains newlines and would
  // never match the single-line regex; iterate the per-block entries.
  const blocks = textAnnotations.slice(1);
  const candidates = [];
  for (const ann of blocks) {
    const s = (ann && typeof ann.description === 'string') ? ann.description.trim() : '';
    if (SERIAL_REGEX.test(s)) candidates.push(s);
  }
  if (candidates.length === 0) return { value: '', candidates: [] };
  // Pick the longest; ties broken by first-occurrence (stable sort).
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  return { value: sorted[0], candidates };
}

if (typeof window !== 'undefined') {
  window.extractSerialFromOcr = extractSerialFromOcr;
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run tests/serial-ocr-extract.test.js`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add assets/js/serial-extract.js tests/serial-ocr-extract.test.js
git commit -m "feat(serial-ocr): pure extractSerialFromOcr heuristic + tests"
```

---

## Task 2: Backwards-compat for `serialNumbers` in `mergeProjectMetadata`

**Files:**
- Modify: `assets/js/firebase-init.js` (around the existing `mergeProjectMetadata` function near line 130-145)
- Test: `tests/firebase-init-serials.test.js`

- [ ] **Step 1: Write failing tests**

`tests/firebase-init-serials.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../assets/js/firebase-init.js'), 'utf8');

// Eval the helpers we need into a sandbox. firebase-init.js is a script
// (not a module); it relies on `firebase` global. We only test pure helpers
// that don't touch firebase, so we stub it.
function loadHelpers() {
  const ctx = { firebase: { firestore: () => ({}) }, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

describe('mergeProjectMetadata serial defaults', () => {
  it('adds category=null and source=manual to legacy entries lacking those fields', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const project = {
      serialNumbers: [{ id: 'a', value: 'OLD-123' }],
    };
    const merged = mergeProjectMetadata(project);
    expect(merged.serialNumbers[0]).toMatchObject({
      id: 'a', value: 'OLD-123', category: null, source: 'manual',
    });
  });

  it('preserves category and source when already present', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const project = {
      serialNumbers: [
        { id: 'a', value: 'X', category: 'batterij', source: 'ocr', photoId: 'p1' },
      ],
    };
    const merged = mergeProjectMetadata(project);
    expect(merged.serialNumbers[0]).toMatchObject({
      id: 'a', value: 'X', category: 'batterij', source: 'ocr', photoId: 'p1',
    });
  });

  it('handles missing serialNumbers array', () => {
    const { mergeProjectMetadata } = loadHelpers();
    const merged = mergeProjectMetadata({});
    expect(merged.serialNumbers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/firebase-init-serials.test.js`
Expected: FAIL — entry lacks category/source.

- [ ] **Step 3: Patch `mergeProjectMetadata` in `assets/js/firebase-init.js`**

Find the line that currently reads (around line 137):

```javascript
  merged.serialNumbers = Array.isArray(project.serialNumbers) ? project.serialNumbers : [];
```

Replace with:

```javascript
  merged.serialNumbers = (Array.isArray(project.serialNumbers) ? project.serialNumbers : []).map(e => ({
    ...e,
    category: (e && e.category != null) ? e.category : null,
    source: (e && e.source) || 'manual',
  }));
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run tests/firebase-init-serials.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add assets/js/firebase-init.js tests/firebase-init-serials.test.js
git commit -m "feat(serial-ocr): merge category/source defaults onto legacy serial entries"
```

---

## Task 3: Tag-modal 2-level radio in `photo-uploader.js`

**Files:**
- Modify: `assets/js/photo-uploader.js` (tag-modal HTML around line 380-388 + save handler around line 416-425)

- [ ] **Step 1: Locate the per-photo radio block**

The current row HTML (around lines 380-389) looks like:

```javascript
const html = `
  <div class="d-flex align-items-center gap-2" data-pu-tag-row="${escapeHtml(id)}">
    <img src="${escapeHtml(thumb)}" class="rounded" style="width:48px;height:48px;object-fit:cover;" alt="" />
    <div class="btn-group btn-group-sm" role="group">
      <input type="radio" class="btn-check" name="tag-${escapeHtml(id)}" id="tag-${escapeHtml(id)}-s" value="situatie" checked />
      <label class="btn btn-outline-primary" for="tag-${escapeHtml(id)}-s"><i class="fa-solid fa-camera me-1"></i>Situatie</label>
      <input type="radio" class="btn-check" name="tag-${escapeHtml(id)}" id="tag-${escapeHtml(id)}-r" value="serial" />
      <label class="btn btn-outline-primary" for="tag-${escapeHtml(id)}-r"><i class="fa-solid fa-barcode me-1"></i>Serieel</label>
    </div>
  </div>
`;
```

- [ ] **Step 2: Replace with 2-level layout**

Substitute the same block with:

```javascript
const html = `
  <div class="d-flex flex-wrap align-items-center gap-2" data-pu-tag-row="${escapeHtml(id)}">
    <img src="${escapeHtml(thumb)}" class="rounded" style="width:48px;height:48px;object-fit:cover;" alt="" />
    <div class="btn-group btn-group-sm" role="group">
      <input type="radio" class="btn-check" name="tag-${escapeHtml(id)}" id="tag-${escapeHtml(id)}-s" value="situatie" checked />
      <label class="btn btn-outline-primary" for="tag-${escapeHtml(id)}-s"><i class="fa-solid fa-camera me-1"></i>Situatie</label>
      <input type="radio" class="btn-check" name="tag-${escapeHtml(id)}" id="tag-${escapeHtml(id)}-r" value="serial" />
      <label class="btn btn-outline-primary" for="tag-${escapeHtml(id)}-r"><i class="fa-solid fa-barcode me-1"></i>Serieel</label>
    </div>
    <div class="btn-group btn-group-sm pu-serial-cat" role="group" data-pu-cat-row="${escapeHtml(id)}" style="display:none;">
      <input type="radio" class="btn-check" name="cat-${escapeHtml(id)}" id="cat-${escapeHtml(id)}-b" value="batterij" checked />
      <label class="btn btn-outline-secondary" for="cat-${escapeHtml(id)}-b">Batterij</label>
      <input type="radio" class="btn-check" name="cat-${escapeHtml(id)}" id="cat-${escapeHtml(id)}-o" value="omvormer" />
      <label class="btn btn-outline-secondary" for="cat-${escapeHtml(id)}-o">Omvormer</label>
      <input type="radio" class="btn-check" name="cat-${escapeHtml(id)}" id="cat-${escapeHtml(id)}-c" value="omvormer_batterij" />
      <label class="btn btn-outline-secondary" for="cat-${escapeHtml(id)}-c">Omvormer+Batterij</label>
    </div>
  </div>
`;
```

- [ ] **Step 3: Wire show/hide of the category row when Serieel selected**

After the row is appended to the list, attach a `change` listener on the top-level tag radios. Find the existing per-row wiring (around line 395-405) that handles bulk-button setting. After that block, add:

```javascript
// Show category row only when this photo is tagged as serial.
['s', 'r'].forEach(suffix => {
  const radio = row.querySelector(`#tag-${id}-${suffix}`);
  if (!radio) return;
  radio.addEventListener('change', () => {
    const catRow = row.querySelector(`[data-pu-cat-row="${id}"]`);
    if (catRow) catRow.style.display = (suffix === 'r') ? '' : 'none';
  });
});
```

If `id` contains special CSS characters, use `CSS.escape(id)` in the selector.

- [ ] **Step 4: Update bulk-button handlers to set category too**

The existing bulk handlers (lines 36-43 of the modal HTML) toggle all rows to `situatie` or `serial`. We add a Batterij default for the Serial bulk:

Find the bulk button HTML around line 36-43 and confirm the `data-pu-bulk="serial"` button still says "Alles → Serieel". Change its label to:

```html
<button type="button" class="btn btn-sm btn-outline-primary" data-pu-bulk="serial">
  <i class="fa-solid fa-barcode me-1"></i>Alles → Serieel · Batterij
</button>
```

Then in the bulk-click handler (around line 395-404), after the existing code that toggles tags, add:

```javascript
// When bulk-tagging as serial, also reveal the category row and reset
// each one to the default Batterij selection.
if (target === 'serial') {
  list.querySelectorAll(`[data-pu-cat-row]`).forEach(catRow => {
    catRow.style.display = '';
    const def = catRow.querySelector(`input[value="batterij"]`);
    if (def) def.checked = true;
  });
} else {
  list.querySelectorAll(`[data-pu-cat-row]`).forEach(catRow => {
    catRow.style.display = 'none';
  });
}
```

- [ ] **Step 5: Update save-handler to write `serialCategory` + `ocrStatus: 'pending'`**

Replace the save-handler block (around lines 406-425) that reads:

```javascript
uploadedIds.forEach(id => {
  const checked = list.querySelector(`input[name="tag-${CSS.escape(id)}"]:checked`);
  const tag = checked && checked.value === 'serial' ? 'serial' : 'situatie';
  if (tag !== 'situatie') {
    const ref = db.collection('projects').doc(options.projectId).collection('photos').doc(id);
    batch.update(ref, { tag });
    patches++;
  }
});
```

With:

```javascript
uploadedIds.forEach(id => {
  const tagChecked = list.querySelector(`input[name="tag-${CSS.escape(id)}"]:checked`);
  const isSerial = tagChecked && tagChecked.value === 'serial';
  const ref = db.collection('projects').doc(options.projectId).collection('photos').doc(id);
  if (isSerial) {
    const catChecked = list.querySelector(`input[name="cat-${CSS.escape(id)}"]:checked`);
    const category = (catChecked && catChecked.value) || 'batterij';
    batch.update(ref, {
      tag: 'serial',
      serialCategory: category,
      ocrStatus: 'pending',
    });
    patches++;
  }
  // No write needed when situatie (default) — saves Firestore quota.
});
```

- [ ] **Step 6: Manually verify in browser**

Open `project-edit.html?project=<some-id>`, upload a photo, watch tag-modal:
- Switching to Serieel shows the category row.
- Switching back to Situatie hides it.
- "Alles → Serieel · Batterij" sets all rows to Serial + Batterij default.
- Saving with a serial-tagged photo writes the new fields (check Firestore console).

- [ ] **Step 7: Commit**

```bash
git add assets/js/photo-uploader.js
git commit -m "feat(serial-ocr): tag-modal 2-level radio writes serialCategory + ocrStatus"
```

---

## Task 4: Re-run helper `requestPhotoOcrRerun` + photo-doc unset helper in `firebase-init.js`

**Files:**
- Modify: `assets/js/firebase-init.js` (add helpers near the existing photo helpers)
- Test: extend `tests/firebase-init-serials.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/firebase-init-serials.test.js`:

```javascript
describe('firebase helper signatures (existence smoke-test)', () => {
  it('exposes requestPhotoOcrRerun on window', () => {
    const { window } = loadHelpers();
    expect(typeof window.requestPhotoOcrRerun).toBe('function');
  });

  it('exposes setPhotoSerialTag on window', () => {
    const { window } = loadHelpers();
    expect(typeof window.setPhotoSerialTag).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/firebase-init-serials.test.js`
Expected: 2 new tests fail — function not defined.

- [ ] **Step 3: Add the helpers**

Find the photo-doc helper region in `assets/js/firebase-init.js` (search for `// Photo helpers` or the existing `uploadProjectPhotoWithThumb`). Add near the end of that region:

```javascript
/**
 * Reset a serial-tagged photo back to ocrStatus=null so the Cloud Function
 * `ocrSerial` re-fires. Used by the "Re-run OCR" knop in the serial-list UI.
 */
async function requestPhotoOcrRerun(projectId, photoId) {
  const db = firebase.firestore();
  await db.collection('projects').doc(projectId)
    .collection('photos').doc(photoId)
    .update({ ocrStatus: null, ocrError: firebase.firestore.FieldValue.delete() });
}

/**
 * Atomically write the serial-tag fields onto a photo-doc. Used by the
 * tag-modal save handler indirectly (the photo-uploader uses a WriteBatch
 * for multi-photo saves; this helper is for single-photo flows / future
 * retag UX).
 */
async function setPhotoSerialTag(projectId, photoId, category) {
  const db = firebase.firestore();
  await db.collection('projects').doc(projectId)
    .collection('photos').doc(photoId)
    .update({
      tag: 'serial',
      serialCategory: category,
      ocrStatus: 'pending',
    });
}

if (typeof window !== 'undefined') {
  window.requestPhotoOcrRerun = requestPhotoOcrRerun;
  window.setPhotoSerialTag = setPhotoSerialTag;
}
```

(If the file already has a single `if (typeof window !== 'undefined')` block at the bottom, add the two new assignments there instead of adding a second block.)

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run tests/firebase-init-serials.test.js`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add assets/js/firebase-init.js tests/firebase-init-serials.test.js
git commit -m "feat(serial-ocr): add requestPhotoOcrRerun + setPhotoSerialTag helpers"
```

---

## Task 5: Cloud Function scaffold — package + empty trigger

**Files:**
- Create: `functions/package.json`, `functions/index.js`, `functions/.gitignore`, `functions/.eslintrc.json`
- Create or modify: `firebase.json` at repo root

- [ ] **Step 1: Create `functions/.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 2: Create `functions/package.json`**

```json
{
  "name": "serial-ocr-functions",
  "private": true,
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint .",
    "deploy": "firebase deploy --only functions:ocrSerial"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0",
    "@google-cloud/vision": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 3: Create `functions/.eslintrc.json`**

```json
{
  "env": { "node": true, "es2022": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "commonjs" }
}
```

- [ ] **Step 4: Create `functions/index.js` (scaffold only, no logic yet)**

```javascript
'use strict';

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Firestore-trigger: when a project photo-doc is written with
 * tag='serial', run Cloud Vision OCR and append a serial entry to
 * project.serialNumbers. Cleanup on retag serial -> situatie.
 *
 * Region: europe-west1 (same as Firestore/Storage).
 */
exports.ocrSerial = functions.firestore
  .onDocumentWritten(
    { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
    async (event) => {
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;
      const { projectId, photoId } = event.params;
      console.log('ocrSerial fired', { projectId, photoId,
        beforeTag: before?.tag, afterTag: after?.tag });
      // Logic added in Task 6.
    },
  );
```

- [ ] **Step 5: Create/extend `firebase.json` at repo root**

If `firebase.json` already exists, merge in the `"functions"` key. If not, create:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "ignore": ["node_modules", ".git", "*.log"]
    }
  ]
}
```

(If `firestore` or `storage` rule entries already exist, preserve them.)

- [ ] **Step 6: Install deps & run lint to verify scaffold parses**

Run:
```bash
cd functions && npm install --no-audit --no-fund && cd ..
```
Expected: `node_modules/` populated, no errors.

Run: `cd functions && node -e "require('./index.js'); console.log('OK')"`
Expected: prints `OK` (admin.initializeApp may warn about emulator-not-running — that's fine).

- [ ] **Step 7: Commit**

```bash
git add functions/.gitignore functions/package.json functions/.eslintrc.json functions/index.js firebase.json
# DO NOT add functions/node_modules — .gitignore should keep it out, double-check:
git status functions/node_modules
# If listed under untracked: STOP, fix .gitignore.
git commit -m "feat(serial-ocr): Cloud Function scaffold (empty handler, deps)"
```

---

## Task 6: Cloud Function — happy-path OCR + Firestore write

**Files:**
- Modify: `functions/index.js`
- Test: `functions/__tests__/ocrSerial.test.js`
- Modify: `functions/package.json` (if test path needs setup)

- [ ] **Step 1: Write the happy-path test (mocked Vision + Storage + Firestore)**

`functions/__tests__/ocrSerial.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @google-cloud/vision before importing the function module.
const mockTextDetection = vi.fn();
vi.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: vi.fn().mockImplementation(() => ({
    textDetection: mockTextDetection,
  })),
}));

// Mock firebase-admin Storage + Firestore.
const mockDownload = vi.fn();
const mockRunTransaction = vi.fn();
const mockProjectDocGet = vi.fn();
const mockProjectDocUpdate = vi.fn();
const mockPhotoDocUpdate = vi.fn();
vi.mock('firebase-admin', () => {
  const admin = {
    initializeApp: vi.fn(),
    apps: [],
    firestore: () => ({
      runTransaction: mockRunTransaction,
      collection: () => ({
        doc: () => ({
          get: mockProjectDocGet,
          update: mockProjectDocUpdate,
          collection: () => ({
            doc: () => ({ update: mockPhotoDocUpdate }),
          }),
        }),
      }),
    }),
    storage: () => ({
      bucket: () => ({
        file: () => ({ download: mockDownload }),
      }),
    }),
  };
  admin.firestore.FieldValue = {
    arrayUnion: (x) => ({ __op: 'arrayUnion', value: x }),
    arrayRemove: (x) => ({ __op: 'arrayRemove', value: x }),
    delete: () => ({ __op: 'delete' }),
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  };
  return { default: admin, ...admin };
});

// Re-import after mocks are in place.
const { handleOcrSerial } = await import('../index.js');

function makeEvent({ before, after, projectId = 'P', photoId = 'PH' }) {
  return {
    data: {
      before: before ? { data: () => before } : null,
      after: after ? { data: () => after } : null,
    },
    params: { projectId, photoId },
  };
}

describe('handleOcrSerial — happy path', () => {
  beforeEach(() => {
    mockTextDetection.mockReset();
    mockDownload.mockReset();
    mockRunTransaction.mockReset();
    mockProjectDocGet.mockReset();
    mockProjectDocUpdate.mockReset();
    mockPhotoDocUpdate.mockReset();
  });

  it('detects serial, appends entry, updates photo-doc ocrStatus=ok', async () => {
    mockDownload.mockResolvedValue([Buffer.from('fake-jpeg-bytes')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL TEXT\nMARSTEK\nSN: ABCD1234\nMODEL X' },
        { description: 'MARSTEK' },
        { description: 'SN' },
        { description: 'ABCD1234' },
        { description: 'MODEL' },
        { description: 'X' },
      ],
    }]);
    mockRunTransaction.mockImplementation(async (fn) => {
      // Simulate transaction by giving the callback a fake txn object.
      const txn = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ serialNumbers: [] }),
        }),
        update: vi.fn(),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: null,
      after: {
        tag: 'serial',
        serialCategory: 'batterij',
        ocrStatus: 'pending',
        storagePath: 'projects/P/123_foto.jpg',
        uploadedBy: 'kevin@bloxit.be',
      },
    });
    await handleOcrSerial(event);

    expect(mockTextDetection).toHaveBeenCalled();
    expect(mockRunTransaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run __tests__/ocrSerial.test.js`
Expected: FAIL — `handleOcrSerial` not exported.

- [ ] **Step 3: Implement the function**

Replace `functions/index.js` with:

```javascript
'use strict';

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { ImageAnnotatorClient } = require('@google-cloud/vision');

if (!admin.apps.length) admin.initializeApp();

// Vision client — singleton, EU endpoint.
const visionClient = new ImageAnnotatorClient({ apiEndpoint: 'eu-vision.googleapis.com' });

// Serial-extraction heuristic (duplicated from assets/js/serial-extract.js;
// Cloud Functions sources cannot reach into the parent repo without a build
// step, and a copy is cheaper than introducing one).
const SERIAL_REGEX = /^[A-Z0-9-]{6,}$/i;
function extractSerialFromOcr(textAnnotations) {
  if (!Array.isArray(textAnnotations) || textAnnotations.length === 0) {
    return { value: '', candidates: [] };
  }
  const blocks = textAnnotations.slice(1);
  const candidates = [];
  for (const ann of blocks) {
    const s = (ann && typeof ann.description === 'string') ? ann.description.trim() : '';
    if (SERIAL_REGEX.test(s)) candidates.push(s);
  }
  if (candidates.length === 0) return { value: '', candidates: [] };
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  return { value: sorted[0], candidates };
}

function shouldRun(before, after) {
  if (!after) return false; // photo deleted
  if (after.tag !== 'serial') return false;
  if (!after.storagePath) return false;
  // Fresh tag→serial, or category change, or re-run requested (ocrStatus=null)
  if (!before || before.tag !== 'serial') return true;
  if (before.serialCategory !== after.serialCategory) return true;
  if (after.ocrStatus === null && before.ocrStatus !== null) return true;
  return false;
}

function shouldCleanup(before, after) {
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

async function handleOcrSerial(event) {
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

exports.ocrSerial = functions.firestore.onDocumentWritten(
  { document: 'projects/{projectId}/photos/{photoId}', region: 'europe-west1' },
  handleOcrSerial,
);

// Exported for tests.
exports.handleOcrSerial = handleOcrSerial;
exports.shouldRun = shouldRun;
exports.shouldCleanup = shouldCleanup;
exports.extractSerialFromOcr = extractSerialFromOcr;
```

- [ ] **Step 4: Run happy-path test, verify it passes**

Run: `cd functions && npx vitest run __tests__/ocrSerial.test.js`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add functions/index.js functions/__tests__/ocrSerial.test.js
git commit -m "feat(serial-ocr): Cloud Function happy-path with Vision + Firestore txn"
```

---

## Task 7: Cloud Function — failure, idempotency, cleanup, re-run

**Files:**
- Modify: `functions/__tests__/ocrSerial.test.js` (extend with more cases)

- [ ] **Step 1: Add failing tests for the remaining paths**

Append to `functions/__tests__/ocrSerial.test.js`:

```javascript
import { shouldRun, shouldCleanup } from '../index.js';

describe('shouldRun / shouldCleanup guards', () => {
  it('runs when fresh tag→serial', () => {
    expect(shouldRun(null, { tag: 'serial', storagePath: 'x' })).toBe(true);
    expect(shouldRun({ tag: 'situatie' }, { tag: 'serial', storagePath: 'x' })).toBe(true);
  });

  it('runs when category changes on already-serial photo', () => {
    expect(shouldRun(
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok', storagePath: 'x' },
      { tag: 'serial', serialCategory: 'omvormer', ocrStatus: 'ok', storagePath: 'x' },
    )).toBe(true);
  });

  it('runs when ocrStatus transitions to null (re-run requested)', () => {
    expect(shouldRun(
      { tag: 'serial', ocrStatus: 'failed', storagePath: 'x' },
      { tag: 'serial', ocrStatus: null, storagePath: 'x' },
    )).toBe(true);
  });

  it('does not run on cosmetic update (same category, same status)', () => {
    expect(shouldRun(
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok' },
      { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'ok' },
    )).toBe(false);
  });

  it('does not run when after has no storagePath', () => {
    expect(shouldRun(null, { tag: 'serial' })).toBe(false);
  });

  it('cleanup fires when retag serial→situatie', () => {
    expect(shouldCleanup(
      { tag: 'serial', serialEntryId: 'sn_1' },
      { tag: 'situatie' },
    )).toBe(true);
  });

  it('cleanup fires when serial photo is deleted', () => {
    expect(shouldCleanup({ tag: 'serial', serialEntryId: 'sn_1' }, null)).toBe(true);
  });

  it('cleanup does not fire on first-time create', () => {
    expect(shouldCleanup(null, { tag: 'serial' })).toBe(false);
  });
});

describe('handleOcrSerial — failure paths', () => {
  beforeEach(() => {
    mockTextDetection.mockReset();
    mockDownload.mockReset();
    mockRunTransaction.mockReset();
    mockPhotoDocUpdate.mockReset();
  });

  it('writes ocrStatus=failed when Vision throws', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockRejectedValue(new Error('vision-down'));

    const event = makeEvent({
      before: null,
      after: { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'pending', storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    // Two photoDoc updates expected: 1) the "ensure pending" pre-write (skipped
    // when already pending), 2) the catch-block failure write.
    expect(mockPhotoDocUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ocrStatus: 'failed',
    }));
  });

  it('writes failed when Vision returns no candidates', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL\nABC\nXYZ' },
        { description: 'ABC' },
        { description: 'XYZ' },
      ], // none ≥ 6 alphanumeric
    }]);
    mockRunTransaction.mockImplementation(async (fn) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ serialNumbers: [] }) }),
        update: vi.fn(),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: null,
      after: { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'pending', storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    // Transaction should have been called even with no detected serial,
    // writing the placeholder failed-entry.
    expect(mockRunTransaction).toHaveBeenCalled();
  });
});

describe('handleOcrSerial — idempotency', () => {
  it('updates existing serial entry when fired twice for same photoId', async () => {
    mockDownload.mockResolvedValue([Buffer.from('x')]);
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [
        { description: 'FULL\nXYZ123456' },
        { description: 'XYZ123456' },
      ],
    }]);
    let txnUpdateCalls = [];
    mockRunTransaction.mockImplementation(async (fn) => {
      const txn = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            serialNumbers: [
              { id: 'sn_old', value: 'OLD', photoId: 'PH', source: 'ocr' },
            ],
          }),
        }),
        update: vi.fn((ref, payload) => txnUpdateCalls.push(payload)),
      };
      return fn(txn);
    });

    const event = makeEvent({
      before: { tag: 'serial', serialCategory: 'batterij', ocrStatus: null, storagePath: 'p.jpg' },
      after: { tag: 'serial', serialCategory: 'batterij', ocrStatus: 'pending', storagePath: 'p.jpg' },
    });
    await handleOcrSerial(event);

    const projectUpdate = txnUpdateCalls.find(p => Array.isArray(p.serialNumbers));
    expect(projectUpdate.serialNumbers).toHaveLength(1);
    expect(projectUpdate.serialNumbers[0].id).toBe('sn_old');
    expect(projectUpdate.serialNumbers[0].value).toBe('XYZ123456');
  });
});
```

- [ ] **Step 2: Run tests, verify all pass**

Run: `cd functions && npx vitest run __tests__/ocrSerial.test.js`
Expected: all tests pass (1 happy + 8 guards + 2 failure + 1 idempotency = 12).

If any guard test fails, the `shouldRun`/`shouldCleanup` logic from Task 6 needs adjustment — fix inline and re-run.

- [ ] **Step 3: Commit**

```bash
git add functions/__tests__/ocrSerial.test.js
git commit -m "test(serial-ocr): function guards, failure paths, idempotency"
```

---

## Task 8: Serial-list UI in `project-edit.html` (Blok D)

**Files:**
- Modify: `project-edit.html` (serial-list rendering region; search for `serialNumbers` references and the existing "Foto's & serienummers" Blok D section)

- [ ] **Step 1: Locate the existing serial-list region**

Search `project-edit.html` for the function that renders serial-rows. It likely lives in a function called `renderSerials(list)` or similar, generating rows with a text input + delete button. The exact line numbers depend on the current code — use `grep -n 'serialNumbers\|renderSerial' project-edit.html` to find them.

- [ ] **Step 2: Add badge CSS to inline `<style>` block in `project-edit.html`**

In the page's inline `<style>` block, add:

```css
.serial-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.serial-row .serial-cat-badge {
  font-size: 11px; padding: 3px 8px; border-radius: 12px; color: #fff; font-weight: 500;
  min-width: 96px; text-align: center;
}
.serial-row .serial-cat-batterij        { background: #2c7be5; }
.serial-row .serial-cat-omvormer        { background: #7e57c2; }
.serial-row .serial-cat-omvormer_batterij { background: #16a34a; }
.serial-row .serial-cat-null            { background: #9ca3af; }
.serial-row .serial-status-icon { width: 18px; text-align: center; }
.serial-row input.serial-value { flex: 1; }
.serial-row .serial-action-btn { background: none; border: 0; color: #64748b; padding: 4px 6px; cursor: pointer; }
.serial-row .serial-action-btn:hover { color: #1e293b; }
```

- [ ] **Step 3: Rewrite the serial-row template to include all new affordances**

Replace the function that renders a single serial-row. Pseudo-code shape — adapt to the existing function signature:

```javascript
function _renderSerialRow(entry, projectId) {
  const cat = entry.category || 'null';
  const catLabels = {
    batterij: 'Batterij',
    omvormer: 'Omvormer',
    omvormer_batterij: 'Omvormer+Batterij',
    'null': '?',
  };
  const status = entry.ocrStatus || 'ok';
  const isPending = status === 'pending';
  const isFailed  = status === 'failed';
  const isOcr     = entry.source === 'ocr';
  const placeholder = isPending
    ? 'OCR bezig...'
    : (isFailed ? 'OCR niet gelukt, vul manueel in' : 'Serienummer');

  const statusIconHtml = isPending
    ? `<i class="fa-solid fa-spinner fa-spin serial-status-icon" title="OCR bezig"></i>`
    : (isFailed
        ? `<i class="fa-solid fa-triangle-exclamation serial-status-icon icon-warn" title="OCR niet gelukt"></i>`
        : `<i class="fa-solid fa-circle-check serial-status-icon icon-ok" title="OK"></i>`);

  const sourceIconHtml = isOcr
    ? `<button type="button" class="serial-action-btn serial-photo-link" data-photo-id="${escapeHtml(entry.photoId || '')}" title="Toon bronfoto"><i class="fa-solid fa-image"></i></button>`
    : `<span class="serial-status-icon"><i class="fa-solid fa-keyboard text-muted" title="Manueel ingevoerd"></i></span>`;

  const rerunBtnHtml = (isOcr && isFailed)
    ? `<button type="button" class="serial-action-btn serial-rerun-btn" data-photo-id="${escapeHtml(entry.photoId || '')}" title="OCR opnieuw proberen"><i class="fa-solid fa-rotate"></i></button>`
    : '';

  return `
    <div class="serial-row" data-serial-id="${escapeHtml(entry.id)}">
      <span class="serial-cat-badge serial-cat-${escapeHtml(cat)}">${escapeHtml(catLabels[cat])}</span>
      ${statusIconHtml}
      ${sourceIconHtml}
      <input type="text" class="form-control form-control-sm serial-value"
             value="${escapeHtml(entry.value || '')}"
             placeholder="${escapeHtml(placeholder)}"
             ${isPending ? 'readonly' : ''} />
      ${rerunBtnHtml}
      <button type="button" class="serial-action-btn serial-delete-btn" title="Verwijderen"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
}
```

If the existing code uses a different rendering pattern (string concat vs DOM nodes), adapt — but keep the data-attributes (`data-serial-id`, `data-photo-id`) and class names exactly as above so wiring in later steps matches.

- [ ] **Step 4: Wire the new click handlers**

In the `wireSerials()` (or equivalent) function that attaches click delegators, add:

```javascript
container.addEventListener('click', async (e) => {
  const rerunBtn = e.target.closest('.serial-rerun-btn');
  if (rerunBtn) {
    const photoId = rerunBtn.getAttribute('data-photo-id');
    if (!photoId) return;
    rerunBtn.disabled = true;
    try {
      await window.requestPhotoOcrRerun(currentProjectId, photoId);
      showToast?.('OCR opnieuw gestart', 'primary');
    } catch (err) {
      showToast?.('Re-run mislukt: ' + (err.message || err), 'danger');
    } finally {
      rerunBtn.disabled = false;
    }
    return;
  }

  const photoLink = e.target.closest('.serial-photo-link');
  if (photoLink) {
    const photoId = photoLink.getAttribute('data-photo-id');
    if (photoId && typeof openPhotoLightbox === 'function') {
      openPhotoLightbox(photoId);
    }
    return;
  }
});
```

(`openPhotoLightbox` is whatever the page already uses for lightbox; if no such function exists, leave the click as a no-op for now and add a TODO comment — out of scope for this task.)

- [ ] **Step 5: Verify in browser**

Open `project-edit.html?project=<id>` with a project that has at least one serial entry. Verify:
- Pre-feature entries show "?" grey badge + keyboard icon + green check
- Layout doesn't break

- [ ] **Step 6: Commit**

```bash
git add project-edit.html
git commit -m "feat(serial-ocr): Blok D serial-list with badges, status icons, re-run knop"
```

---

## Task 9: onSnapshot subscription for project-edit Blok D

**Files:**
- Modify: `project-edit.html`

- [ ] **Step 1: Locate the load-and-render flow**

Search `project-edit.html` for `getProject(` — there's a function (likely `loadAndRender` or `init`) that does a one-shot read and renders all blocks. We need to ADD an onSnapshot subscription scoped to the serial-list only, layered on top of the existing one-shot read.

- [ ] **Step 2: Add subscription after initial render**

After the existing `await loadAndRender(projectId)` call (or after the initial render commits), add:

```javascript
let _serialUnsub = null;
function _subscribeSerials(projectId) {
  const db = firebase.firestore();
  _serialUnsub = db.collection('projects').doc(projectId).onSnapshot(snap => {
    if (!snap.exists) return;
    const merged = mergeProjectMetadata(snap.data());
    // Only re-render the serial-list, not the whole form (avoid clobbering
    // user-typed fields elsewhere).
    const container = document.getElementById('peSerialList'); // adjust to actual id
    if (!container) return;
    container.innerHTML = merged.serialNumbers.map(e => _renderSerialRow(e, projectId)).join('');
    // Re-wire delete buttons if they need per-row binding (already covered by
    // event-delegation in wireSerials, no-op here).
  }, err => {
    console.warn('serial onSnapshot error', err);
  });
}
_subscribeSerials(projectId);

// Cleanup on page unload.
window.addEventListener('beforeunload', () => {
  if (_serialUnsub) _serialUnsub();
});
```

Replace `peSerialList` with the actual container id used in the existing render. Replace `_renderSerialRow` with the function created in Task 8.

- [ ] **Step 3: Manually verify**

In two browser tabs:
1. Open `project-edit.html?project=X` in tab A.
2. From tab B (e.g. dashboard drawer), trigger a serial-write (or open Firestore console and manually edit `project.serialNumbers`).
3. Confirm tab A's serial-list updates without reload.

- [ ] **Step 4: Commit**

```bash
git add project-edit.html
git commit -m "feat(serial-ocr): subscribe Blok D serial-list to project onSnapshot"
```

---

## Task 10: Mirror serial-list UI in `dashboard.html` drawer

**Files:**
- Modify: `dashboard.html` (drawer serial-list rendering region)

- [ ] **Step 1: Locate the drawer's serial-list rendering**

Search `dashboard.html` for the drawer's serial section (likely `renderDrawerSerials` or inside `renderDrawer(project)`).

- [ ] **Step 2: Replace the row-template with the same shape as Task 8**

Reuse the same `_renderSerialRow(entry, projectId)` function shape, the same CSS classes, the same data-attributes. If the inline `<style>` block in `dashboard.html` lacks the badge CSS from Task 8 Step 2, add it there too.

- [ ] **Step 3: Wire the same click handlers**

Same handlers as Task 8 Step 4. The drawer already has onSnapshot on the project doc, so live updates work automatically.

- [ ] **Step 4: Manually verify**

Open `dashboard.html`, click a project to open the drawer. Confirm the serial-list shows badges and (for pre-feature data) keyboard icons.

- [ ] **Step 5: Commit**

```bash
git add dashboard.html
git commit -m "feat(serial-ocr): drawer serial-list mirrors Blok D treatment"
```

---

## Task 11: E2E happy-path test (mocked OCR via Firestore-stub)

**Files:**
- Create: `e2e/tests/serial-ocr.spec.js`

The Cloud Function isn't deployed in the test environment, so we can't run real OCR end-to-end. Instead we simulate the function: after the photo-upload + tag flow writes `ocrStatus: 'pending'`, the test writes the post-OCR state directly via Firebase Admin (acting as the function would).

- [ ] **Step 1: Write the spec file**

```javascript
import { test, expect } from '../helpers/auth-fixture.js';
import { createTestProject, deleteTestProject } from '../helpers/project-helpers.js';
import admin from 'firebase-admin';

test.describe('serial-OCR happy-path', () => {
  let projectId;

  test.beforeEach(async () => {
    projectId = await createTestProject({ customerName: 'OCR Test Klant' });
  });

  test.afterEach(async () => {
    if (projectId) await deleteTestProject(projectId);
  });

  test('upload + tag as serial + simulate OCR → row appears in Blok D', async ({ page }) => {
    await page.goto(`/project-edit.html?project=${projectId}`);
    await page.waitForSelector('#peBlokDPhotoUploader'); // or whatever the actual id is

    // 1) Upload a fixture image via the hidden file input.
    const fileInput = page.locator('input[type=file]').first();
    await fileInput.setInputFiles('e2e/fixtures/serial-photo.jpg');

    // 2) Tag-modal appears — switch first photo to Serieel + Batterij.
    await page.waitForSelector('#pu-tag-modal');
    await page.locator('#pu-tag-modal input[value="serial"]').first().click();
    await page.locator('#pu-tag-modal input[value="batterij"]').first().click();
    await page.locator('[data-pu-modal-save]').click();

    // 3) Wait for photo-doc to have ocrStatus=pending.
    const db = admin.firestore();
    let photoId = null;
    await expect.poll(async () => {
      const snap = await db.collection('projects').doc(projectId).collection('photos').get();
      const doc = snap.docs.find(d => d.data().tag === 'serial');
      if (!doc) return null;
      photoId = doc.id;
      return doc.data().ocrStatus;
    }, { timeout: 10_000 }).toBe('pending');

    // 4) Simulate the Cloud Function: write the post-OCR state.
    const photoRef = db.collection('projects').doc(projectId).collection('photos').doc(photoId);
    const projectRef = db.collection('projects').doc(projectId);
    const newEntry = {
      id: 'sn_test1', value: 'OCRTEST12345', category: 'batterij',
      source: 'ocr', photoId, ocrStatus: 'ok',
      uploadedAt: admin.firestore.Timestamp.now(), uploadedBy: 'ocr-test',
    };
    await db.runTransaction(async (txn) => {
      const ps = await txn.get(projectRef);
      const list = ps.data().serialNumbers || [];
      txn.update(projectRef, { serialNumbers: [...list, newEntry] });
      txn.update(photoRef, { ocrStatus: 'ok', serialEntryId: 'sn_test1' });
    });

    // 5) Verify the row appears in the serial-list (onSnapshot path).
    await expect(page.locator('.serial-row .serial-value').filter({ hasNot: page.locator('[readonly]') }))
      .toHaveValue('OCRTEST12345', { timeout: 5000 });
    await expect(page.locator('.serial-row .serial-cat-batterij')).toBeVisible();
  });
});
```

- [ ] **Step 2: Provide the fixture image**

```bash
mkdir -p e2e/fixtures
# Use any small JPEG. A 1x1 black pixel works since we mock OCR.
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00\x43\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\x09\x09\x08\x0a\x0c\x14\x0d\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c\x20\x24\x2e\x27\x20\x22\x2c\x23\x1c\x1c\x28\x37\x29\x2c\x30\x31\x34\x34\x34\x1f\x27\x39\x3d\x38\x32\x3c\x2e\x33\x34\x32\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\xfb\xff\xd9' > e2e/fixtures/serial-photo.jpg
```

- [ ] **Step 3: Run the test**

Ensure local server is running on port 8000 (`python3 -m http.server 8000` from repo root in another shell).

Run: `npx playwright test e2e/tests/serial-ocr.spec.js --config=e2e/playwright.config.js`

Expected: 1 test passes.

If the test fails because the actual element ids in `project-edit.html` differ from the spec, adjust the selectors. The intent (upload → tag-as-serial → mock OCR → row appears) must hold.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/serial-ocr.spec.js e2e/fixtures/serial-photo.jpg
git commit -m "test(e2e): serial-OCR happy-path with mocked Firestore-stub"
```

---

## Task 12: E2E failure-path test (re-run knop)

**Files:**
- Modify: `e2e/tests/serial-ocr.spec.js` (extend with second test)

- [ ] **Step 1: Append the failure-path test**

Append inside the same `test.describe` block:

```javascript
test('failed OCR shows re-run knop → click resets to pending', async ({ page }) => {
  // Pre-seed a serial-tagged photo + failed entry directly via Admin.
  const db = admin.firestore();
  const photoRef = db.collection('projects').doc(projectId).collection('photos').doc('photo_failed');
  await photoRef.set({
    tag: 'serial', serialCategory: 'omvormer', ocrStatus: 'failed',
    storagePath: `projects/${projectId}/test_fake.jpg`,
    serialEntryId: 'sn_fail1', ocrError: 'no-text-detected',
    uploadedBy: 'test', uploadedAt: admin.firestore.Timestamp.now(),
  });
  await db.collection('projects').doc(projectId).update({
    serialNumbers: [{
      id: 'sn_fail1', value: '', category: 'omvormer', source: 'ocr',
      photoId: 'photo_failed', ocrStatus: 'failed',
      uploadedAt: admin.firestore.Timestamp.now(), uploadedBy: 'test',
    }],
  });

  await page.goto(`/project-edit.html?project=${projectId}`);

  const row = page.locator('[data-serial-id="sn_fail1"]');
  await expect(row).toBeVisible({ timeout: 5000 });
  await expect(row.locator('.serial-rerun-btn')).toBeVisible();

  await row.locator('.serial-rerun-btn').click();

  await expect.poll(async () => {
    const snap = await photoRef.get();
    return snap.data().ocrStatus;
  }, { timeout: 5000 }).toBe(null);
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test e2e/tests/serial-ocr.spec.js --config=e2e/playwright.config.js`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/serial-ocr.spec.js
git commit -m "test(e2e): serial-OCR failure-path + re-run knop"
```

---

## Task 13: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a new section after the "Shared photo-uploader component" section**

Append:

```markdown
## Serial-OCR pipeline (2026-05-19)

Serial-tagged foto's worden door een Cloud Function (`functions/index.js`,
trigger `onDocumentWritten` op `projects/{id}/photos/{photoId}`, regio
`europe-west1`) doorgehaald langs Google Cloud Vision (EU endpoint). De
function leest de blob via Admin SDK, extracteert het langste alfanumerieke
token (≥ 6 chars) via `extractSerialFromOcr` (gedupliceerd in
`assets/js/serial-extract.js` voor de client en `functions/index.js` voor de
server), en append in één transactie een entry aan `project.serialNumbers`
met `source: 'ocr'`, `category`, `photoId`, en `ocrStatus`.

Photo-doc velden:
- `tag: 'situatie' | 'serial'`
- `serialCategory?: 'batterij' | 'omvormer' | 'omvormer_batterij'`
- `ocrStatus?: 'pending' | 'ok' | 'failed' | null` (`null` = re-run requested)
- `ocrCandidates?: string[]`
- `serialEntryId?: string` (link naar `project.serialNumbers[].id`)

Serial-entry shape (uitgebreid t.o.v. pre-feature `{id, value}`):
`{id, value, category, source, photoId?, ocrStatus?, uploadedAt, uploadedBy}`.
Pre-feature entries krijgen `category: null` + `source: 'manual'` via lazy
merge in `mergeProjectMetadata`.

**Tag-modal** (`assets/js/photo-uploader.js`) heeft 2-level radio: Situatie/Serieel
+ wanneer Serieel zichtbaar Batterij/Omvormer/Omvormer+Batterij.

**UI** in Blok D (`project-edit.html`) en drawer (`dashboard.html`):
category-badge + status-icon (spinner/check/warning) + source-icon
(image/keyboard) + value-input + re-run knop (alleen failed) + delete.
Project-edit Blok D subscribet op project-doc `onSnapshot` zodat pending →
ok transitie live update.

**Deploy**: `cd functions && npm install && firebase deploy --only functions:ocrSerial`.
Service-account heeft Vision API + Firestore + Storage rollen nodig. Geen
API-key in code of Firestore — ADC via de function's eigen service-account.

**Cost**: $1.50/1000 photos (eerste 1000/maand gratis).

**Re-run** (failed OCR): klik `fa-rotate` knop op de serial-rij → schrijft
`ocrStatus: null` op photo-doc → function fired opnieuw.

**Cleanup**: retag serial → situatie verwijdert de gekoppelde
`project.serialNumbers`-entry en cleart de OCR-velden op de photo-doc.

Bebat-export UI (filteren op `category in ['batterij', 'omvormer_batterij']`)
is een follow-up; het datamodel is er klaar voor.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: serial-OCR pipeline section in CLAUDE.md"
```

---

## Final verification

- [ ] Run all unit tests: `npm test`
  Expected: all previous tests + new tests pass (legacy `tests/product-specs.test.js` collection-error stays as pre-existing issue from gh-pages).

- [ ] Run all function tests: `cd functions && npm test`
  Expected: 12 tests pass.

- [ ] Run E2E suite: `npx playwright test --config=e2e/playwright.config.js`
  Expected: all tests pass including 2 new serial-OCR specs.

- [ ] Confirm `git status` is clean and `git log gh-pages..HEAD --oneline` shows the task commits in order.

- [ ] (Deploy step — optional, requires Firebase CLI auth): `cd functions && npm install && firebase deploy --only functions:ocrSerial`. Manually test by uploading a real Marstek sticker photo on the live `gh-pages` site.

After all tasks are green, this branch is ready for review-and-merge using the `finishing-a-development-branch` skill.
