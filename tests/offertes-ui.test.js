import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/offertes-ui.js', import.meta.url), 'utf8');
const dashboardHtml = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const quotePreviewSource = readFileSync(new URL('../assets/js/quote-preview.js', import.meta.url), 'utf8');

describe('offertes-ui quote preview action', () => {
  it('opent de volledige Billit/offerte-preview op het dashboard zonder redirect of iframe', () => {
    expect(dashboardHtml).toContain('assets/js/quote-preview.js');
    expect(source).toContain('window.SmartPeakQuotePreview.openQuoteModal(context');
    expect(source).not.toMatch(/window\.location\.href\s*=\s*quoteTools\.buildQuoteContextUrl/);
    expect(source).not.toContain('quotePreviewFrame');
    expect(quotePreviewSource).toContain('id="quoteModal"');
    expect(quotePreviewSource).toContain('id="btnCreateBillitOffer"');
    expect(quotePreviewSource).toContain('function createBillitOfferFromPreview');
    expect(quotePreviewSource).toContain('context.calculatedLine');
    expect(quotePreviewSource).toContain('amountInclVat / (1 + vat / 100)');
    expect(quotePreviewSource).not.toContain('<iframe');
  });

  it('toont ook een offerteknop voor custom calculator-configs in project/drawer lijst', () => {
    expect(source).toContain("const isCustomCalculatorConfig = typeof t === 'string' && t.startsWith('CUSTOM_');");
    expect(source).toContain('const canCreateOffer = !isManual && (cfg.productConfigId || isProductConfig || isCustomCalculatorConfig);');
    expect(source).toContain('offerte-create-btn');
    expect(source).toContain('buildQuoteContextFromProjectConfig(project, type');
  });
});
