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
