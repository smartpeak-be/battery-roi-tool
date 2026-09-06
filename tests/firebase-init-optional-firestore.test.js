import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../assets/js/firebase-init.js'), 'utf8');

function loadWith(firebase) {
  const ctx = { firebase, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

describe('Firebase initialization with optional SDK bundles', () => {
  it('initializes Auth when Firestore is not loaded', () => {
    const auth = { onAuthStateChanged() {} };
    const app = {};
    const ctx = loadWith({
      initializeApp: () => app,
      auth: () => auth,
    });

    expect(() => ctx.initFirebase()).not.toThrow();
    expect(ctx.getAuth()).toBe(auth);
  });

  it('throws a focused error only when Firestore is actually requested', () => {
    const ctx = loadWith({
      initializeApp: () => ({}),
      auth: () => ({}),
    });

    expect(() => ctx.getDb()).toThrow('Firestore SDK niet geladen');
  });
});
