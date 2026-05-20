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

  it('prefers a value next to an SN label over a longer unrelated token', () => {
    const annotations = [
      { description: 'MODEL ZENDURE-SUPER-LONG-TYPE\nS/N: ZD123456789\nCE 2024' },
      { description: 'ZENDURE-SUPER-LONG-TYPE' },
      { description: 'S/N' },
      { description: 'ZD123456789' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('ZD123456789');
  });

  it('can pick the line below a serial label', () => {
    const annotations = [
      { description: 'Serial Number\nZX987654321\nMODEL-VERY-LONG-NOT-SERIAL' },
      { description: 'MODEL-VERY-LONG-NOT-SERIAL' },
    ];
    expect(extractSerialFromOcr(annotations).value).toBe('ZX987654321');
  });

  it('adds a lower-label bonus for battery stickers when there is no explicit SN label', () => {
    const annotations = [
      { description: 'TYPE-CODE-LONG-999\nZD-BAT-123456' },
      {
        description: 'TYPE-CODE-LONG-999',
        boundingPoly: { vertices: [{ y: 10 }, { y: 10 }, { y: 30 }, { y: 30 }] },
      },
      {
        description: 'ZD-BAT-123456',
        boundingPoly: { vertices: [{ y: 80 }, { y: 80 }, { y: 100 }, { y: 100 }] },
      },
    ];
    expect(extractSerialFromOcr(annotations, { category: 'batterij' }).value).toBe('ZD-BAT-123456');
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
