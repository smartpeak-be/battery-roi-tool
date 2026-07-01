import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  defaultCommunicationTemplates,
  normalizeTemplate,
  renderTemplateHtml,
  renderTemplatePlainText,
} from '../assets/js/communication-templates.js';

const pageSource = readFileSync(new URL('../communicatie-templates.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../assets/js/pages/communicatie-templates-app.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');


describe('communicatie templates', () => {
  it('voorziet een standaard intake-template met SmartPeak informatieblokken', () => {
    const [template] = defaultCommunicationTemplates();
    expect(template.id).toBe('intake-thuisbatterij');
    expect(template.subject).toBe('Gegevens voor voorstel thuisbatterij');
    expect(template.blocks.map(b => b.title)).toEqual(expect.arrayContaining([
      '1. Verbruiksdata via MyFluvius',
      '2. Zonnepanelen en omvormer',
      '3. Woning, aansluiting en situatie',
      '4. Foto’s en documenten',
      'Niet alles moet meteen perfect zijn',
    ]));
    expect(template.blocks.map(b => b.text).join('\n')).toContain('Mogelijk heb je intussen al een deel hiervan doorgestuurd');
  });

  it('rendert emailvriendelijke HTML met table-layout, inline basisstijl en variabelen', () => {
    const html = renderTemplateHtml(defaultCommunicationTemplates()[0]);
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('style="margin:0;padding:0;background:');
    expect(html).toContain('SmartPeak');
    expect(html).toContain('Dag voornaam');
    expect(html).toContain('✓');
  });

  it('rendert platte tekst zodat template later tekstueel aangepast kan worden', () => {
    const text = renderTemplatePlainText(defaultCommunicationTemplates()[0]);
    expect(text).toContain('Dag voornaam');
    expect(text).toContain('- Historische data exporteren als CSV-bestand');
    expect(text).toContain('Met vriendelijke groeten');
  });

  it('normaliseert ontbrekende velden naar veilige defaults', () => {
    const template = normalizeTemplate({ name: 'Test', blocks: [{ type: 'unknown', text: 'Hallo' }] });
    expect(template.name).toBe('Test');
    expect(template.blocks[0]).toMatchObject({ type: 'paragraph', text: 'Hallo', items: [] });
  });

  it('heeft een beheerpagina met blok-editor, CSS-sectie en preview/export-acties', () => {
    expect(pageSource).toContain('id="blockEditor"');
    expect(pageSource).toContain('id="styleCustomCss"');
    expect(pageSource).toContain('id="templatePreview"');
    expect(pageSource).toContain('id="btnExportHtml"');
    expect(pageSource).toContain('id="btnCopyText"');
    expect(appSource).toContain('communicationTemplates');
    expect(appSource).toContain('renderTemplateHtml');
    expect(appSource).toContain('renderTemplatePlainText');
    expect(dashboardSource).toContain('communicatie-templates.html');
  });
});
