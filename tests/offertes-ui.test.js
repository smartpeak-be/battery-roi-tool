import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/offertes-ui.js', import.meta.url), 'utf8');

describe('offertes-ui quote preview action', () => {
  it('stuurt vanuit het dashboard door naar het bestaande offertevenster zonder iframe-modal', () => {
    expect(source).toContain('window.location.href = quoteTools.buildQuoteContextUrl(context)');
    expect(source).not.toContain('quotePreviewFrame');
    expect(source).not.toContain('openQuotePreviewModal');
    expect(source).not.toContain('QUOTE_PREVIEW_MODAL_HTML');
  });
});
