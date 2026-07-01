import { escapeHtml } from './shared-helpers.js';

export const COMMUNICATION_TEMPLATE_VERSION = 1;

export const DEFAULT_INTAKE_TEMPLATE = {
  id: 'intake-thuisbatterij',
  name: 'Intake thuisbatterij',
  category: 'intake',
  subject: 'Gegevens voor voorstel thuisbatterij',
  description: 'Eerste gegevensopvraag voor klanten die interesse tonen in een thuisbatterij of energieoptimalisatie.',
  isSystemDefault: true,
  style: {
    brandColor: '#0d6efd',
    accentColor: '#00b478',
    backgroundColor: '#f4f7fb',
    cardColor: '#ffffff',
    textColor: '#172033',
    mutedColor: '#667085',
    fontFamily: 'Arial, Helvetica, sans-serif',
    borderRadius: 18,
    customCss: '',
  },
  variables: [
    { key: 'voornaam', label: 'Voornaam klant', fallback: 'voornaam' },
    { key: 'context', label: 'Korte persoonlijke context', fallback: 'je aanvraag rond een thuisbatterij' },
    { key: 'planning', label: 'Planning/afspraak indien relevant', fallback: '' },
  ],
  blocks: [
    {
      id: 'intro',
      type: 'paragraph',
      title: 'Intro',
      text: 'Dag {{voornaam}},\n\nBedankt voor {{context}}. Om een correcte inschatting te kunnen maken, verzamelen we graag eerst de gegevens die hieronder staan. Mogelijk heb je intussen al een deel hiervan doorgestuurd; dat is uiteraard prima. Zie deze mail vooral als het volledige overzicht van de info die we idealiter gebruiken om technisch en financieel juist te kunnen inschatten welke oplossing zinvol is.',
    },
    {
      id: 'why',
      type: 'callout',
      title: 'Waarom deze info?',
      text: 'Hoe meer gegevens we vooraf hebben, hoe gerichter we kunnen werken. Zo vermijden we onnodige verplaatsingen, kunnen we de juiste batterij-opstelling kiezen en zien we sneller of een thuisbatterij in jouw situatie ook echt interessant is.',
    },
    {
      id: 'myfluvius',
      type: 'checklist',
      title: '1. Verbruiksdata via MyFluvius',
      text: 'Het belangrijkste zijn de historische verbruiks- en injectiegegevens uit MyFluvius. Kies liefst een zo lang mogelijke periode, idealiter minstens één volledig jaar.',
      items: [
        'Historische data exporteren als CSV-bestand',
        'Detailniveau op dagtotalen zetten',
        'Zowel afname als injectie meesturen',
        'Indien mogelijk ook de historiek van het piekvermogen meesturen',
        'Als de P1-poort nog niet actief staat: die alvast activeren via MyFluvius',
      ],
    },
    {
      id: 'solar',
      type: 'checklist',
      title: '2. Zonnepanelen en omvormer',
      text: 'Voor de keuze van batterij en omvormer moeten we weten wat er vandaag al aanwezig is.',
      items: [
        'Vermogen of aantal zonnepanelen, indien gekend',
        'Merk en type van de zonnepanelenomvormer',
        'Duidelijke foto van het typeplaatje van de omvormer',
        'Bouwjaar van de installatie',
        'Of de zonnepaneleninstallatie gekeurd is',
      ],
    },
    {
      id: 'home',
      type: 'checklist',
      title: '3. Woning, aansluiting en situatie',
      text: 'Deze gegevens helpen om het btw-tarief, de technische aansluiting en de praktische plaatsing juist in te schatten.',
      items: [
        'Of de woning ouder is dan 10 jaar',
        'Of er een digitale meter aanwezig is',
        'Of je aansluiting eenfasig, 3 x 230 V of 3 x 400 V + N is, als je dat weet',
        'Of er wifi beschikbaar is bij de digitale meter, zekeringkast en mogelijke batterijplaats',
        'Of er een vrij stopcontact aanwezig is bij de digitale meter',
      ],
    },
    {
      id: 'photos',
      type: 'checklist',
      title: '4. Foto’s en documenten',
      text: 'Foto’s hoeven niet professioneel te zijn. Duidelijke overzichtsfoto’s zijn meestal al voldoende om veel vooraf te kunnen beoordelen.',
      items: [
        'Digitale meter en de ruimte errond',
        'Zekeringkast, liefst overzichtelijk en veilig gefotografeerd',
        'Zonnepanelenomvormer en typeplaatje',
        'Mogelijke plaats waar de batterij zou kunnen komen',
        'Keuringsverslag en elektrische schema’s, als die snel beschikbaar zijn',
      ],
    },
    {
      id: 'price',
      type: 'paragraph',
      title: '5. Energieprijs',
      text: 'Voor de terugverdientijd is de totale elektriciteitsprijs per kWh belangrijk, inclusief taksen, nettarieven en andere kosten. Als je die prijs kent, mag je die gerust doorgeven. Je mag ook een recente afrekening meesturen; dan rekenen wij dit zelf even uit. Als dat niet meteen lukt, gebruiken we voorlopig een realistische richtwaarde en verfijnen we die later.',
    },
    {
      id: 'reassurance',
      type: 'callout',
      title: 'Niet alles moet meteen perfect zijn',
      text: 'Lukt het niet om alles onmiddellijk te bezorgen, dan is dat zeker geen probleem. Stuur gerust al door wat beschikbaar is. Wat ontbreekt, kunnen we later telefonisch of tijdens een plaatsbezoek samen bekijken.',
    },
    {
      id: 'closing',
      type: 'paragraph',
      title: 'Afsluiter',
      text: 'Zodra we de gegevens ontvangen hebben, bekijken we welke opstellingen technisch mogelijk en financieel interessant zijn. Daarna kunnen we de volgende stap bepalen: een gerichte berekening, voorstel of plaatsbezoek.\n\nAlvast bedankt.\n\nMet vriendelijke groeten,\nKevin\nSmartPeak',
    },
  ],
};

export function defaultCommunicationTemplates() {
  return [cloneTemplate(DEFAULT_INTAKE_TEMPLATE)];
}

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

export function normalizeTemplate(template = {}) {
  const base = cloneTemplate(DEFAULT_INTAKE_TEMPLATE);
  const blocks = Array.isArray(template.blocks) ? template.blocks : base.blocks;
  return {
    ...base,
    ...template,
    id: template.id || base.id,
    name: template.name || base.name,
    subject: template.subject || base.subject,
    style: { ...base.style, ...(template.style || {}) },
    variables: Array.isArray(template.variables) ? template.variables : base.variables,
    blocks: blocks.map((block, index) => normalizeBlock(block, index)),
  };
}

export function normalizeBlock(block = {}, index = 0) {
  const type = ['paragraph', 'callout', 'checklist', 'spacer'].includes(block.type) ? block.type : 'paragraph';
  return {
    id: block.id || `block_${index + 1}`,
    type,
    title: block.title || '',
    text: block.text || '',
    items: Array.isArray(block.items) ? block.items.map(item => String(item || '').trim()).filter(Boolean) : [],
  };
}

export function replaceVariables(text, variables = []) {
  let output = String(text || '');
  variables.forEach(variable => {
    const key = variable && variable.key;
    if (!key) return;
    const fallback = variable.fallback || variable.label || key;
    output = output.replaceAll(`{{${key}}}`, fallback);
  });
  return output;
}

function paragraphsHtml(text, variables) {
  return replaceVariables(text, variables)
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p style="margin:0 0 14px;line-height:1.58;">${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

function checklistHtml(block, style, variables) {
  const intro = block.text ? paragraphsHtml(block.text, variables) : '';
  const items = (block.items || []).map(item => `
    <tr>
      <td width="26" valign="top" style="padding:6px 8px 6px 0;color:${style.accentColor};font-weight:700;">✓</td>
      <td valign="top" style="padding:6px 0;color:${style.textColor};line-height:1.48;">${escapeHtml(replaceVariables(item, variables))}</td>
    </tr>`).join('');
  return `${intro}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px;">${items}</table>`;
}

function blockHtml(block, style, variables) {
  if (block.type === 'spacer') return '<tr><td style="height:18px;font-size:18px;line-height:18px;">&nbsp;</td></tr>';
  const body = block.type === 'checklist'
    ? checklistHtml(block, style, variables)
    : paragraphsHtml(block.text, variables);
  const title = block.title ? `<h2 style="margin:0 0 12px;font-size:18px;line-height:1.25;color:${style.textColor};">${escapeHtml(block.title)}</h2>` : '';
  const isCallout = block.type === 'callout';
  const boxStyle = isCallout
    ? `background:${style.backgroundColor};border-left:4px solid ${style.accentColor};border-radius:${Math.max(8, Number(style.borderRadius) - 6)}px;padding:18px 18px 4px;`
    : 'padding:0;';
  return `
    <tr>
      <td style="padding:0 0 18px;">
        <div style="${boxStyle}">
          ${title}
          ${body}
        </div>
      </td>
    </tr>`;
}

export function renderTemplateHtml(templateInput) {
  const template = normalizeTemplate(templateInput);
  const style = template.style;
  const customCss = style.customCss ? `<style>${style.customCss}</style>` : '';
  const blocks = template.blocks.map(block => blockHtml(block, style, template.variables)).join('');
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(template.subject)}</title>
  ${customCss}
</head>
<body style="margin:0;padding:0;background:${style.backgroundColor};font-family:${style.fontFamily};color:${style.textColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${style.backgroundColor};">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:680px;background:${style.cardColor};border-radius:${style.borderRadius}px;overflow:hidden;box-shadow:0 18px 45px rgba(16,24,40,.10);">
          <tr>
            <td style="padding:24px 28px;background:${style.brandColor};color:#ffffff;">
              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.86;">SmartPeak</div>
              <h1 style="margin:6px 0 0;font-size:24px;line-height:1.25;font-weight:700;">${escapeHtml(template.name)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:${style.textColor};font-size:15px;line-height:1.55;">
              ${blocks}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#f8fafc;color:${style.mutedColor};font-size:12px;line-height:1.5;">
              SmartPeak · Thuisbatterijen en energieoptimalisatie<br>
              Deze mail is opgesteld met een herbruikbare SmartPeak-template en kan voor verzending tekstueel aangepast worden.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderTemplatePlainText(templateInput) {
  const template = normalizeTemplate(templateInput);
  return template.blocks.map(block => {
    const title = block.title ? `${block.title}\n` : '';
    const text = replaceVariables(block.text, template.variables);
    const items = block.items && block.items.length ? `\n${block.items.map(item => `- ${replaceVariables(item, template.variables)}`).join('\n')}` : '';
    return `${title}${text}${items}`.trim();
  }).filter(Boolean).join('\n\n');
}
