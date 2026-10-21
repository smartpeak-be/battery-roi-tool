import { escapeHtml, showToast } from '../shared-helpers.js';
import { renderResult, yearlyFigures } from '../lead-result/renderers.js';

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

    container.innerHTML = renderResult(lead);
    wireCTA(leadId, lead, 'btnContact');
    wireCTA(leadId, lead, 'btnContactBottom');
    const yearly = yearlyFigures(lead);
    if (yearly) {
      // Render the chart after the DOM is in place; failure is silent (the card hides itself).
      const storedKwh = yearly.stored ? yearly.stored.max * yearly.days / 365 : 0;
      renderUsageChart(lead, storedKwh).catch(err => {
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

async function renderUsageChart(lead, storedKwh) {
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

  // Spread what the battery takes over (over the whole period) proportionally to the
  // monthly injection, capped at the monthly consumption. Indicative only.
  const totalInj = inj.reduce((s, v) => s + v, 0);
  const shownShare = dc.afname.length > 0 ? Math.min(1, trimmed.length * 30.4 / dc.afname.length) : 1;
  const batteryKwh = (storedKwh || 0) * shownShare;
  const battery = trimmed.map(([, v]) => {
    const share = totalInj > 0 ? v.injectie / totalInj : 1 / trimmed.length;
    return Math.round(Math.min(share * batteryKwh, v.afname));
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
          label: 'Door een batterij opgevangen (indicatief)',
          data: battery,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,0.18)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          borderDash: [6, 3],
          hidden: !(storedKwh > 0)
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
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, filter: (item, data) => !data.datasets[item.datasetIndex].hidden } },
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
      // The notification to SmartPeak is queued by the leadMailsOnUpdate Cloud Function.
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

