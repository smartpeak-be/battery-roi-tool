import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../producten.html', import.meta.url), 'utf8');

describe('producten.html dynamic product config specs', () => {
  test('loads Firebase helpers so PC_ catalog configs can render specs', () => {
    expect(html).toContain('firebase-auth-compat.js');
    expect(html).toContain('firebase-firestore-compat.js');
    expect(html).toContain('firebase-storage-compat.js');
    expect(html).toContain('assets/js/firebase-init.js');
  });

  test('routes PC_ config types to live product configuration renderer instead of fallback', () => {
    expect(html).toContain("const PRODUCT_CONFIG_TYPE_PREFIX = 'PC_'");
    expect(html).toContain('type.startsWith(PRODUCT_CONFIG_TYPE_PREFIX)');
    expect(html).toContain('await renderProductConfigSpecs(type)');
    expect(html).toContain('window.getProductConfig(id)');
    expect(html).toContain('window.getProduct(item.productId)');
  });

  test('still keeps legacy hard-coded specs pages', () => {
    expect(html).toContain('renderZendureAcPlus(parseInt');
    expect(html).toContain('renderMarstek(parseInt');
    expect(html).toContain('renderZendure(parseInt');
  });
});
