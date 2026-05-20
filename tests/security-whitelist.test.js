import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const EXPECTED_WHITELIST = ['kevin@bloxit.be', 'ledsrepair@gmail.com'];

function fileText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function emailsIn(path) {
  const matches = fileText(path).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(e => e.toLowerCase()))].sort();
}

describe('security whitelist drift guard', () => {
  it.each([
    'assets/js/firebase-init.js',
    'firestore.rules',
    'storage.rules',
    'lead-result.html',
  ])('%s uses the expected whitelisted/admin emails', path => {
    expect(emailsIn(path)).toEqual([...EXPECTED_WHITELIST].sort());
  });
});
