// Result mail for the lead wizard. Pure functions, no DOM, no Firestore.
// Used by lead.html (pages/lead-app.js) and the website embed (widgets/lead-wizard.js),
// so both send exactly the same mail. The subject must match firestore.rules.

import { LEAD_DEFAULTS } from './lead-calc.js';

export const LEAD_RESULT_SUBJECT = 'Je batterij-analyse is klaar SmartPeak';
// Both must match firestore.rules (isValidLeadContactMail).
export const LEAD_CONTACT_TO = ['kevin@smartpeak.be', 'ruben@smartpeak.be'];
export const leadContactSubject = (customerName) => `Nieuwe contactaanvraag: ${customerName || 'Onbekend'}`;

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nl = (n) => String(n).replace('.', ',');

export function buildLeadResultMailHtml({ customerName, resultUrl, defaultsUsed }) {
  const du = defaultsUsed || {};
  const defItems = [];
  if (du.pvInverterKw)        defItems.push(`omvormervermogen (${nl(LEAD_DEFAULTS.pvInverterKw)} kW)`);
  if (du.pricePerKwh)         defItems.push(`energiekost (${nl(LEAD_DEFAULTS.pricePerKwh)} EUR/kWh)`);
  if (du.houseAgeOver10Years) defItems.push(`BTW-tarief (${LEAD_DEFAULTS.btw}%)`);
  const disclaimerBlock = defItems.length ? `
        <tr><td style="padding:0 32px 24px">
          <div style="background:#f8f9fa;border-radius:10px;padding:14px 18px;color:#495057;font-size:13px;line-height:1.5">
            Deze berekening is gebaseerd op jouw verbruiksdata, aangevuld met gemiddelde waarden voor <strong>${defItems.join(', ')}</strong>.
            Voor een nauwkeurigere analyse op maat van jouw situatie nemen we graag contact op.
          </div>
        </td></tr>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
  <!-- Header -->
  <tr><td style="padding:28px 32px 16px">
    <span style="font-size:22px;font-weight:700;color:#2c7be5">SmartPeak</span><br>
    <span style="font-size:13px;color:#6b7a8d">Slim omgaan met jouw energie</span>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 0">
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:8px 32px 0;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 16px">Hallo ${escapeHtml(customerName)},</p>
    <p style="margin:0 0 16px">Bedankt dat je gebruik hebt gemaakt van onze gratis batterij-analyse tool! Op basis van jouw Fluvius-data hebben we een persoonlijke analyse voor je klaarstaan.</p>
  </td></tr>
  <!-- CTA -->
  <tr><td align="center" style="padding:8px 32px 24px">
    <a href="${escapeHtml(resultUrl)}" style="display:inline-block;padding:14px 28px;background:#2c7be5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Bekijk mijn resultaat</a>
  </td></tr>
  <!-- Defaults disclaimer -->
  ${disclaimerBlock}
  <!-- Closing -->
  <tr><td style="padding:0 32px 24px;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 8px">Heb je vragen of wil je meer weten? Aarzel niet om contact met ons op te nemen!</p>
    <p style="margin:0;color:#6b7a8d">Met vriendelijke groeten,<br>Het SmartPeak team</p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f0f2f5;padding:20px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7a8d;line-height:1.5">
      <strong style="color:#4a5a70">SmartPeak</strong> &middot; Slim omgaan met jouw energie<br>
      <a href="mailto:info@smartpeak.be" style="color:#6b7a8d;text-decoration:none">info@smartpeak.be</a> &middot;
      <a href="https://smartpeak.be" style="color:#6b7a8d;text-decoration:none">smartpeak.be</a>
    </p>
    <hr style="border:none;border-top:1px solid #dde1e6;margin:12px 0">
    <p style="margin:0;font-size:11px;color:#adb5bd;line-height:1.4">SmartPeak opereert onder Blox-it BV (BE0730.696.050) en LED’s Repair (BE1035.486.678).</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Notification to Kevin and Ruben when someone asks to be contacted after the analysis
 * (from the website or from lead-result.html).
 * @param {object} lead  customerName, email, defaultsUsed, pricePerKwh; optional phone
 * @param {object} [extra] indication (buildPublicIndication) and source, when known
 */
export function buildLeadContactMailHtml(lead, { indication = null, source = '' } = {}) {
  const du = lead.defaultsUsed || {};
  const defItems = [];
  if (du.pvInverterKw)        defItems.push(`omvormervermogen (${nl(LEAD_DEFAULTS.pvInverterKw)} kW)`);
  if (du.pricePerKwh)         defItems.push(`energiekost (${nl(LEAD_DEFAULTS.pricePerKwh)} EUR/kWh)`);
  if (du.houseAgeOver10Years) defItems.push(`BTW-tarief (${LEAD_DEFAULTS.btw}%)`);
  const row = (label, value) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7a8d;white-space:nowrap;vertical-align:top">${label}</td>
        <td style="padding:4px 0">${value}</td>
      </tr>`;
  const rows = [
    row('Naam', `<strong>${escapeHtml(lead.customerName || '')}</strong>`),
    row('Email', `<a href="mailto:${escapeHtml(lead.email || '')}" style="color:#2c7be5;text-decoration:none">${escapeHtml(lead.email || '')}</a>`),
    lead.phone ? row('Telefoon', `<a href="tel:${escapeHtml(String(lead.phone).replace(/[^\d+]/g, ''))}" style="color:#2c7be5;text-decoration:none">${escapeHtml(lead.phone)}</a>`) : '',
    indication ? row('Analyse', `tot ± ${nl(indication.capacityKwh)} kWh opslag, ± ${indication.storedKwhPerYear.toLocaleString('nl-BE')} kWh zelf gebruikt per jaar, besparing tot € ${indication.savingUpToEur.toLocaleString('nl-BE')} per jaar aan ${nl(indication.pricePerKwh)} EUR/kWh`) : '',
    source ? row('Via', escapeHtml(source)) : '',
    defItems.length ? row('Standaardwaarden', defItems.join(', ')) : ''
  ].join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="padding:28px 32px 16px">
    <span style="font-size:22px;font-weight:700;color:#2c7be5">SmartPeak</span><br>
    <span style="font-size:13px;color:#6b7a8d">Admin notificatie</span>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 0">
  </td></tr>
  <tr><td style="padding:8px 32px 0;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 16px">Er is een nieuwe contactaanvraag via de batterij-analyse tool:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:15px;line-height:1.6">${rows}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:8px 32px 24px">
    <a href="https://smartpeak-be.github.io/battery-roi-tool/dashboard.html" style="display:inline-block;padding:14px 28px;background:#2c7be5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Open dashboard</a>
  </td></tr>
  <tr><td style="background:#f0f2f5;padding:16px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#adb5bd;line-height:1.4">SmartPeak opereert onder Blox-it BV (BE0730.696.050) en LED’s Repair (BE1035.486.678).</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
