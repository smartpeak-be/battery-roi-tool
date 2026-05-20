import { escapeHtml, showToast } from '../shared-helpers.js';
import { renderNotProfitable, renderProfitable, rVal } from '../lead-result/renderers.js';

const container = document.getElementById('resultContainer');

(async function loadResult() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('r');
  if (!leadId) {
    container.innerHTML = '<p class="text-center text-danger py-5">Ongeldige link — geen resultaat-ID gevonden.</p>';
    return;
  }

  try {
    initFirebase();
    const lead = await getLead(leadId);
    if (!lead) {
      container.innerHTML = '<p class="text-center text-danger py-5">Resultaat niet gevonden. Mogelijk is de link verlopen.</p>';
      return;
    }

    if (!lead.result) {
      container.innerHTML = renderNotProfitable(lead);
      wireCTA(leadId, lead);
      return;
    }

    container.innerHTML = renderProfitable(lead);
    wireCTA(leadId, lead, 'btnContact');
    wireCTA(leadId, lead, 'btnContactBottom');
    if (lead.csvDailyCompact) {
      // Render the chart after the DOM is in place; failure is silent (the card hides itself).
      const recF = rVal(lead.result ? lead.result.recoveryPctFull : 0);
      const recP = rVal(lead.result ? lead.result.recoveryPctPartial : 0);
      const selfPct = Math.max(0, Math.min(100, (recF.max || 0) + (recP.max || 0)));
      renderUsageChart(lead, selfPct).catch(err => {
        console.warn('[lead-result] chart render failed:', err);
        const wrap = document.getElementById('usageChartCard');
        if (wrap) wrap.style.display = 'none';
      });
    }
  } catch (e) {
    container.innerHTML = `<p class="text-center text-danger py-5">Kon resultaat niet laden: ${escapeHtml(e.message || String(e))}</p>`;
  }
})();

// ── Chart ────────────────────────────────────────────────────────────────────

async function renderUsageChart(lead, selfPct) {
  await SmartPeakChartLoader.loadChartJs();
  const dc = lead.csvDailyCompact;
  if (!dc || !dc.startDate || !Array.isArray(dc.afname) || dc.afname.length === 0) {
    const wrap = document.getElementById('usageChartCard');
    if (wrap) wrap.style.display = 'none';
    return;
  }

  // Bucket per month from the daily arrays.
  const start = new Date(dc.startDate + 'T00:00:00');
  const buckets = new Map(); // 'YYYY-MM' → { afname, injectie, label }
  for (let i = 0; i < dc.afname.length; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, { afname: 0, injectie: 0, label: monthShortLabel(d) });
    }
    const b = buckets.get(key);
    b.afname   += dc.afname[i]   || 0;
    b.injectie += dc.injectie[i] || 0;
  }

  const months = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const trimmed = months.length > 12 ? months.slice(-12) : months;
  const labels  = trimmed.map(([, v]) => v.label);
  const inj     = trimmed.map(([, v]) => Math.round(v.injectie));
  const afname  = trimmed.map(([, v]) => Math.round(v.afname));

  // Estimate monthly battery savings proportional to monthly injection,
  // capped at monthly consumption. Annual total = afname * selfPct / 100.
  const totalInj = inj.reduce((s, v) => s + v, 0);
  const totalAf  = afname.reduce((s, v) => s + v, 0);
  const annualBatteryKwh = totalAf * (selfPct || 0) / 100;
  const battery = trimmed.map(([, v]) => {
    const share = totalInj > 0 ? v.injectie / totalInj : 1 / trimmed.length;
    return Math.round(Math.min(share * annualBatteryKwh, v.afname));
  });

  const ctx = document.getElementById('usageChart');
  if (!ctx) return;

  // eslint-disable-next-line no-undef
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Injectie (naar het net)',
          data: inj,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.10)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Batterijbesparing',
          data: battery,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,0.18)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          borderDash: [6, 3]
        },
        {
          label: 'Afname (van het net)',
          data: afname,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220,38,38,0.10)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('nl-BE')} kWh`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => v.toLocaleString('nl-BE') + ' kWh' }
        }
      }
    }
  });
}

function monthShortLabel(d) {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

function wireCTA(leadId, lead, btnId = 'btnContact') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  // If the lead is already hot, swap the button for the confirmation right away.
  if (lead.status === 'hot_lead') {
    btn.parentElement.innerHTML = '<p class="sp-lead-cta-done"><i class="fa-solid fa-circle-check"></i> Aanvraag ontvangen — we nemen snel contact op!</p>';
    return;
  }
  btn.addEventListener('click', async () => {
    const allButtons = document.querySelectorAll('.sp-cta-button');
    allButtons.forEach(b => { b.disabled = true; });
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Even geduld...';
    try {
      await updateLeadToHot(leadId);
      // Build defaults info for admin
      const du = lead.defaultsUsed || {};
      const defItems = [];
      if (du.pvInverterKw)       defItems.push('omvormervermogen (3,5 kW)');
      if (du.pricePerKwh)        defItems.push('energiekost (0,34 EUR/kWh)');
      if (du.houseAgeOver10Years) defItems.push('BTW-tarief (21%)');
      const defaultsRow = defItems.length
        ? `<tr><td style="padding:4px 0;color:#6b7a8d;font-size:13px">Standaardwaarden: ${defItems.join(', ')}</td></tr>`
        : '';

      await createMailDoc({
        kind: 'lead_contact',
        leadId,
        to: ['kevin@bloxit.be', 'ledsrepair@gmail.com'],
        message: {
          subject: `Nieuwe contactaanvraag: ${lead.customerName || 'Onbekend'}`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
  <!-- Header -->
  <tr><td style="padding:28px 32px 16px">
    <span style="font-size:22px;font-weight:700;color:#2c7be5">SmartPeak</span><br>
    <span style="font-size:13px;color:#6b7a8d">Admin notificatie</span>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 0">
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:8px 32px 0;color:#333;font-size:15px;line-height:1.6">
    <p style="margin:0 0 16px">Er is een nieuwe contactaanvraag via de batterij-analyse tool:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:15px;line-height:1.6">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7a8d;white-space:nowrap">Naam</td>
        <td style="padding:4px 0;font-weight:600">${escapeHtml(lead.customerName || '')}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#6b7a8d;white-space:nowrap">Email</td>
        <td style="padding:4px 0"><a href="mailto:${escapeHtml(lead.email || '')}" style="color:#2c7be5;text-decoration:none">${escapeHtml(lead.email || '')}</a></td>
      </tr>
      ${defaultsRow}
    </table>
  </td></tr>
  <!-- CTA -->
  <tr><td align="center" style="padding:8px 32px 24px">
    <a href="https://smartpeak-be.github.io/battery-roi-tool/dashboard.html" style="display:inline-block;padding:14px 28px;background:#2c7be5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Open dashboard</a>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f0f2f5;padding:16px 32px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#adb5bd;line-height:1.4">SmartPeak &middot; Blox-it BV &middot; BE0730.696.050</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
        }
      });
      // Replace every CTA card with the confirmation message so neither button can be clicked again.
      document.querySelectorAll('.sp-cta-card').forEach(card => {
        card.innerHTML = '<p class="sp-lead-cta-done mb-0"><i class="fa-solid fa-circle-check"></i> Aanvraag ontvangen — we nemen snel contact op!</p>';
      });
    } catch (_) {
      showToast('Er ging iets mis. Probeer opnieuw.', 'danger');
      allButtons.forEach(b => { b.disabled = false; });
      btn.innerHTML = '<i class="fa-solid fa-phone" aria-hidden="true"></i> Plan een vrijblijvend gesprek';
    }
  });
}

