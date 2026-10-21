import { describe, expect, it } from 'vitest';
import { normalizeBillitEmail, normalizeBillitPhone } from '../assets/js/billit-helpers.js';

describe('Billit helpers', () => {
  it('omits invalid phone numbers so Billit does not reject the order body', () => {
    expect(normalizeBillitPhone('12345')).toBe('');
    expect(normalizeBillitPhone('0470000000')).toBe('0470000000');
    expect(normalizeBillitPhone('+32 470 00 00 00')).toBe('+32 470 00 00 00');
  });

  it('omits invalid e-mail addresses but keeps valid addresses', () => {
    expect(normalizeBillitEmail('')).toBe('');
    expect(normalizeBillitEmail('geen-mail')).toBe('');
    expect(normalizeBillitEmail(' klant@example.com ')).toBe('klant@example.com');
  });
});
