import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const firebaseInit = readFileSync(new URL('../assets/js/firebase-init.js', import.meta.url), 'utf8');

describe('share link expiry', () => {
  it('stays below the rule cap so devices with a clock running ahead can still create links', () => {
    const shareRule = rules.slice(rules.indexOf('function isValidShareCreate'));
    const capDays = Number(shareRule.match(/expiresAt <= request\.time \+ duration\.value\((\d+), 'd'\)/)[1]);
    const ttlDays = Number(firebaseInit.match(/const SHARE_LINK_TTL_DAYS = (\d+);/)[1]);
    expect(ttlDays).toBeLessThan(capDays);
  });
});
