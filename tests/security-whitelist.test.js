import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ACCESS_WHITELIST = ['kevin@bloxit.be', 'kevin@smartpeak.be', 'ledsrepair@gmail.com', 'ruben@smartpeak.be'];
const LEAD_CONTACT_RECIPIENTS = ['kevin@smartpeak.be', 'ruben@smartpeak.be'];

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
  ])('%s uses the expected access emails', path => {
    expect(emailsIn(path)).toEqual([...ACCESS_WHITELIST].sort());
  });

  it('lead-result contact mails go to the SmartPeak task users', () => {
    expect(emailsIn('assets/js/pages/lead-result-app.js')).toEqual([...LEAD_CONTACT_RECIPIENTS].sort());
  });
});
