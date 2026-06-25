import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../assets/js/pages/producten-beheer-app.js', import.meta.url), 'utf8');

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
    expect(source).toContain('function staticProductMediaKey');
    expect(source).toContain("haystack.includes('dl5.0c')");
    expect(source).toContain("haystack.includes('powerbrick')");
    expect(source).toContain("haystack.includes('powerbox g2')");
    expect(source).toContain("haystack.includes('luna2000')");
    expect(source).toContain("haystack.includes('sigen')");
  });
});
