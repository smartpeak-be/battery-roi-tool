// Lead mails, built on the server from the lead document only. Clients cannot write
// to the `mail` collection, so nobody can choose the recipient or the content of a
// mail sent from the SmartPeak address. Pure functions: no Firestore, easy to test.

// Same defaults as assets/js/lead-calc.js (LEAD_DEFAULTS); only used to explain them in the mail.
const LEAD_DEFAULTS = { pvInverterKw: 3.5, pricePerKwh: 0.34, btw: 21 };

export const LEAD_RESULT_PAGE_URL = 'https://smartpeak-be.github.io/battery-roi-tool/lead-result.html';
export const LEAD_RESULT_SUBJECT = 'Je batterij-analyse is klaar SmartPeak';
export const LEAD_CONTACT_RECIPIENTS = ['kevin@smartpeak.be', 'ruben@smartpeak.be'];
const DASHBOARD_URL = 'https://smartpeak-be.github.io/battery-roi-tool/dashboard.html';
const COMPANIES_LINE = 'SmartPeak opereert onder Blox-it BV (BE0730.696.050) en LED’s Repair (BE1035.486.678).';
// Deliberately strict: one plain address, nothing a mail library could read as a list or a
// mailto: link could read as parameters.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const isPlainEmail = (value) => EMAIL_PATTERN.test(String(value || '').trim());

const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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

export function buildLeadContactMailHtml(lead, leadId) {
  const du = lead.defaultsUsed || {};
  const defItems = [];
  if (du.pvInverterKw)        defItems.push(`omvormervermogen (${nl(LEAD_DEFAULTS.pvInverterKw)} kW)`);
  if (du.pricePerKwh)         defItems.push(`energiekost (${nl(LEAD_DEFAULTS.pricePerKwh)} EUR/kWh)`);
  if (du.houseAgeOver10Years) defItems.push(`BTW-tarief (${LEAD_DEFAULTS.btw}%)`);
  const row = (label, value) => value
    ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7a8d;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`
    : '';
  const email = isPlainEmail(lead.email) ? escapeHtml(String(lead.email).trim()) : '';
  const notes = String(lead.notes || '').trim();
  const source = lead.csvDailyCompact ? 'de batterij-analyse' : 'de website';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f272e">
<table width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;padding:24px 28px">
<tr><td>
  <p style="margin:0 0 4px;font-size:20px;font-weight:700">SmartPeak</p>
  <p style="margin:0 0 20px;color:#6b7a8d;font-size:13px">Nieuwe contactaanvraag via ${source}</p>
  <table cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5;margin-bottom:16px">
    ${row('Naam', `<strong>${escapeHtml(oneLine(lead.customerName, 120) || 'Onbekend')}</strong>`)}
    ${row('E-mail', email ? `<a href="mailto:${email}">${email}</a>` : '')}
    ${row('Standaardwaarden', escapeHtml(defItems.join(', ')))}
  </table>
  ${notes ? `<div style="white-space:pre-wrap;background:#f3f7f5;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.5">${escapeHtml(notes)}</div>` : ''}
  <p style="margin:20px 0 0"><a href="${DASHBOARD_URL}" style="color:#0a6a78">Open het dashboard</a> · lead-id ${escapeHtml(leadId)}</p>
  <p style="margin:16px 0 0;font-size:11px;color:#adb5bd">${COMPANIES_LINE}</p>
</td></tr></table>
</body></html>`;
}

// A lead from the analysis wizard (lead.html or the website embed) carries consumption data;
// a plain website contact request does not and gets no result mail.
export function leadResultMailFor(leadId, lead) {
  if (!lead || !lead.csvDailyCompact || !isPlainEmail(lead.email)) return null;
  return {
    id: `lead_result_${leadId}`,
    doc: {
      kind: 'lead_result',
      leadId,
      to: String(lead.email).trim(),
      message: {
        subject: LEAD_RESULT_SUBJECT,
        html: buildLeadResultMailHtml({
          customerName: lead.customerName,
          resultUrl: `${LEAD_RESULT_PAGE_URL}?r=${encodeURIComponent(leadId)}`,
          defaultsUsed: lead.defaultsUsed,
        }),
      },
    },
  };
}

// Sent once, when a lead turns from cold to hot (website contact form or the result page's CTA).
export function leadContactMailFor(leadId, before, after) {
  if (!after || after.status !== 'hot_lead' || (before && before.status === 'hot_lead')) return null;
  return {
    id: `lead_contact_${leadId}`,
    doc: {
      kind: 'lead_contact',
      leadId,
      to: LEAD_CONTACT_RECIPIENTS,
      message: {
        subject: `Nieuwe contactaanvraag: ${oneLine(after.customerName, 80) || 'Onbekend'}`.slice(0, 200),
        html: buildLeadContactMailHtml(after, leadId),
      },
    },
  };
}
