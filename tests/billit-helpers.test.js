import { describe, expect, it } from 'vitest';
import { normalizeBillitEmail, normalizeBillitPhone } from '../assets/js/billit-helpers.js';

describe('Billit helpers', () => {
  it('omits invalid phone numbers so Billit does not reject the order body', () => {
    expect(normalizeBillitPhone('12345')).toBe('');
    expect(normalizeBillitPhone('0479717633')).toBe('0479717633');
    expect(normalizeBillitPhone('+32 479 71 76 33')).toBe('+32 479 71 76 33');
  });

  it('omits invalid e-mail addresses but keeps valid addresses', () => {
    expect(normalizeBillitEmail('')).toBe('');
    expect(normalizeBillitEmail('geen-mail')).toBe('');
    expect(normalizeBillitEmail(' klant@example.com ')).toBe('klant@example.com');
  });
});
