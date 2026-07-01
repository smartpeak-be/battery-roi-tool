import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  defaultCommunicationTemplates,
  normalizeTemplate,
  projectVariableDefinitionsByCategory,
  projectVariableValues,
  replaceVariables,
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

  it('voorziet de relevante SmartPeak vervolgtemplates als defaults', () => {
    const templates = defaultCommunicationTemplates();
    expect(templates).toHaveLength(13);
    expect(templates.map(t => t.id)).toEqual(expect.arrayContaining([
      'intake-thuisbatterij',
      'intake-na-plaatsbezoek',
      'reminder-myfluvius-data',
      'berekening-klaar',
      'offerte-verzenden',
      'akkoord-ontvangen',
      'voorschotfactuur',
      'installatieplanning-bevestigen',
      'keuring-inplannen',
      'na-installatie-opvolging',
      'afsluitdossier-factuur-review',
      'niet-rendabel',
      'geen-zonnepanelen',
    ]));
    expect(templates.find(t => t.id === 'voorschotfactuur').blocks.map(b => b.text).join('\n')).toContain('Blox-it BV');
    expect(templates.find(t => t.id === 'niet-rendabel').blocks.map(b => b.text).join('\n')).toContain('meerwaarde vandaag te beperkt');
  });

  it('rendert emailvriendelijke HTML met table-layout, inline basisstijl en variabelen', () => {
    const html = renderTemplateHtml(defaultCommunicationTemplates()[0]);
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('style="margin:0;padding:0;background:');
    expect(html).toContain('class="sp-mail-block sp-mail-block-paragraph sp-mail-block-intro"');
    expect(html).toContain('class="sp-mail-block-inner" style="padding:18px 18px 4px 22px;"');
    expect(html).toContain('class="sp-mail-block sp-mail-block-callout sp-mail-block-why"');
    expect(html).toContain('SmartPeak');
    expect(html).toContain('Dag voornaam');
    expect(html).toContain('✓');
    expect(html).not.toContain('Deze mail is opgesteld met een herbruikbare SmartPeak-template');
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

  it('maakt projectvariabelen beschikbaar en vervangt gekende en toekomstige projectvelden', () => {
    const groups = projectVariableDefinitionsByCategory();
    expect(groups.Project.map(v => v.key)).toContain('project.customerName');
    expect(groups.Klant.map(v => v.key)).toContain('project.customer.email');
    expect(groups.Planning.map(v => v.key)).toContain('project.planning.installationPlannedDate');
    expect(groups.Bebat.map(v => v.key)).toContain('project.batteryRegistry.bebatStatus');

    const project = {
      customerName: 'Jan Peeters',
      customer: { email: 'jan@example.test' },
      planning: { installationPlannedDate: '2026-08-10' },
      site: { houseAgeOver10Years: true },
      customFutureField: 'later bruikbaar',
    };
    const values = projectVariableValues(project);
    expect(values['project.customerName']).toBe('Jan Peeters');
    expect(values['project.site.houseAgeOver10Years']).toBe('ja');
    expect(values['project.customFutureField']).toBe('later bruikbaar');
    expect(replaceVariables('Dag {{project.customerName}} — {{project.customFutureField}}', [], project)).toBe('Dag Jan Peeters — later bruikbaar');
  });

  it('kan projectvariabelen in HTML en platte tekst renderen', () => {
    const template = normalizeTemplate({
      blocks: [{ id: 'project-ref', type: 'paragraph', title: 'Project', text: 'Klant: {{project.customerName}}\nEmail: {{project.customer.email}}' }],
    });
    const project = { customerName: 'Evelien Test', customer: { email: 'evelien@example.test' } };
    expect(renderTemplateHtml(template, project)).toContain('Klant: Evelien Test');
    expect(renderTemplatePlainText(template, project)).toContain('Email: evelien@example.test');
  });

  it('heeft een beheerpagina met blok-editor, CSS-sectie en preview/export-acties', () => {
    expect(pageSource).toContain('id="blockEditor"');
    expect(pageSource).toContain('id="styleCustomCss"');
    expect(pageSource).toContain('id="templatePreview"');
    expect(pageSource).toContain('id="btnExportHtml"');
    expect(pageSource).toContain('id="btnCopyText"');
    expect(pageSource).toContain('id="projectVariableList"');
    expect(appSource).toContain('communicationTemplates');
    expect(appSource).toContain('projectVariableDefinitionsByCategory');
    expect(appSource).toContain('renderTemplateHtml');
    expect(appSource).toContain('renderTemplatePlainText');
    expect(dashboardSource).toContain('communicatie-templates.html');
  });
});
