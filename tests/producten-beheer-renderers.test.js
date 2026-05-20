import { describe, expect, it } from 'vitest';
import { escapeAttr, productDatasheetsHtml, productPhotosHtml } from '../assets/js/producten-beheer/renderers.js';

describe('producten-beheer renderers', () => {
  it('escapes quotes in attributes', () => {
    expect(escapeAttr('14" Display')).toBe('14&quot; Display');
  });

  it('escapes product photo attributes', () => {
    const html = productPhotosHtml([{
      id: 'p"1',
      storagePath: 'products/"bad"',
      thumbStoragePath: 'thumbs/"bad"',
      thumbUrl: 'https://example.test/t.jpg?x="1"',
      downloadUrl: 'https://example.test/full.jpg?x="1"',
      name: 'Foto "A"',
    }]);

    expect(html).toContain('data-photo-id="p&quot;1"');
    expect(html).toContain('alt="Foto &quot;A&quot;"');
    expect(html).not.toContain('data-photo-id="p"1"');
  });

  it('escapes datasheet labels and attributes', () => {
    const html = productDatasheetsHtml([{
      id: 'd"1',
      storagePath: 'datasheets/"bad"',
      downloadUrl: 'https://example.test/doc.pdf?x="1"',
      name: 'Datasheet <Pro> "A"',
      sizeBytes: 2048,
    }]);

    expect(html).toContain('data-ds-id="d&quot;1"');
    expect(html).toContain('Datasheet &lt;Pro&gt; &quot;A&quot;');
    expect(html).toContain('2 KB');
  });
});
