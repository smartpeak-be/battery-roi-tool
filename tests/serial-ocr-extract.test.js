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
