import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/offertes-ui.js', import.meta.url), 'utf8');

describe('offertes-ui quote preview action', () => {
  it('opent de Billit/offerte-preview in een modal zonder van de dashboardpagina weg te navigeren', () => {
    expect(source).toContain('function openQuotePreviewModal');
    expect(source).toContain('quotePreviewFrame');
    expect(source).toContain('openQuotePreviewModal(quoteTools.buildQuoteContextUrl(context))');
    expect(source).not.toMatch(/window\.location\.href\s*=\s*quoteTools\.buildQuoteContextUrl/);
  });
});
