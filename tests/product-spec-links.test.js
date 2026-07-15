import { describe, expect, it } from 'vitest';
import {
  calculatorConfigSpecItems,
  calculatorConfigSpecsUrl,
} from '../assets/js/product-spec-links.js';

describe('calculator product specs links', () => {
  it('carries Nico-style custom composition products to the specs page', () => {
    const cfg = {
      type: 'CUSTOM_1783436239629_ip8s',
      omschrijving: 'Installatiekost & SMA Pakket 2x3.6kw + 5kw omvormer',
      items: [],
      compositionLines: [
        { kind: 'product', productId: '4T5mi4Wer7KtvqJq2P3r', qty: 1 },
        { kind: 'product', productId: 'uTbcP0QHRkKMLGftpBdV', qty: 1 },
        { kind: 'inspection', productId: 'lgloRjY0hL3s7bXiZre6', qty: 1 },
        { kind: 'bebat', description: 'Bebat bijdrage' },
      ],
    };

    const url = new URL(calculatorConfigSpecsUrl(cfg), 'https://smartpeak.test/');
    expect(url.pathname).toBe('/producten.html');
    expect(url.searchParams.get('type')).toBe(cfg.type);
    expect(url.searchParams.get('name')).toBe(cfg.omschrijving);
    expect(JSON.parse(url.searchParams.get('items'))).toEqual([
      { productId: '4T5mi4Wer7KtvqJq2P3r', qty: 1 },
      { productId: 'uTbcP0QHRkKMLGftpBdV', qty: 1 },
    ]);
  });

  it('merges duplicate catalog products and ignores non-product calculation lines', () => {
    expect(calculatorConfigSpecItems({
      compositionLines: [
        { kind: 'product', productId: 'battery', qty: 1 },
        { kind: 'product', productId: 'battery', qty: 2 },
        { kind: 'manual', productId: 'ignored', qty: 1 },
      ],
    })).toEqual([{ productId: 'battery', qty: 3 }]);
  });

  it('uses catalog config items when there are no custom composition lines', () => {
    const cfg = {
      type: 'PC_config-1',
      productConfigName: 'Solis pakket',
      items: [{ productId: 'solis', qty: 1 }],
    };
    const url = new URL(calculatorConfigSpecsUrl(cfg), 'https://smartpeak.test/');
    expect(JSON.parse(url.searchParams.get('items'))).toEqual([{ productId: 'solis', qty: 1 }]);
  });

  it('keeps legacy type links and hides specs only when no renderable product exists', () => {
    expect(calculatorConfigSpecsUrl({ type: 'MARVE03_X2' })).toBe('producten.html?type=MARVE03_X2');
    expect(calculatorConfigSpecsUrl({ type: 'MANUAL_1', isManual: true, omschrijving: 'Los bedrag' })).toBe('');
    expect(calculatorConfigSpecsUrl({ type: 'CUSTOM_empty', compositionLines: [] })).toBe('');
    expect(calculatorConfigSpecsUrl({ isManual: true, omschrijving: 'Los bedrag' })).toBe('');
  });
});
