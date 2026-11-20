import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staticProductDatasheets, staticProductPhotos } from '../assets/js/product-static-media.js';

const source = readFileSync(new URL('../assets/js/product-static-media.js', import.meta.url), 'utf8');

describe('product static media links', () => {
  it('exposes official/static product documents for supported catalogue items', () => {
    expect(source).toContain('const STATIC_PRODUCT_MEDIA');
    expect(source).toContain('Dyness DL5.0C Pro — Datasheet');
    expect(source).toContain('PowerBrickdatasheetEN20250701-201.pdf');
    expect(source).toContain('PowerboxG2DatasheetEN20250627.pdf');
    expect(source).toContain('Huawei LUNA2000-S1 — Datasheet PDF');
    expect(source).toContain('Sigenergy SigenStor — Download center');
    expect(source).toContain('AB3000L_User_Manual_20260422_EN_FR.pdf');
  });

  it('matches static media by brand/model text beyond Zendure only', () => {
    expect(staticProductDatasheets({ model: 'Dyness DL5.0C Pro' })).not.toHaveLength(0);
    expect(staticProductDatasheets({ model: 'Dyness DL5.0C' })).toHaveLength(0);
    expect(staticProductDatasheets({ model: 'Dyness PowerBrick' })).not.toHaveLength(0);
    expect(staticProductPhotos({ model: 'Dyness Powerbox G2' })).not.toHaveLength(0);
    expect(staticProductDatasheets({ model: 'Huawei LUNA2000-7-S1' })).not.toHaveLength(0);
    expect(staticProductDatasheets({ model: 'Huawei LUNA2000-S0' })).toHaveLength(0);
    expect(staticProductPhotos({ model: 'Sigenergy SigenStor' })).not.toHaveLength(0);
    expect(staticProductPhotos({ model: 'Sigenergy Sigen Energy Meter' })).toHaveLength(0);
  });
});
