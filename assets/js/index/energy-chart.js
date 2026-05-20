import {
  MONTH_NL_FULL,
  buildDayBuckets, buildMonthBuckets, buildMonthBucketsFromMonthMap,
  buildYearBuckets, buildYearBucketsFromMonthMap, availableMonthKeys,
} from '../calc-engine.js';

// Energy chart state and rendering for index.html.
let _energyChartInstance = null;
let _chartState = { level: 'month', dayMonthIdx: -1 };
let _chartHandlersWired = false;
let _lastChartData = null;
function setActiveLevel(level) {
  ['Year','Month','Day'].forEach(L => {
    const btn = document.getElementById('btnLevel' + L);
    if (!btn) return;
    const isActive = L.toLowerCase() === level;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  document.getElementById('chartDayNav').style.display = level === 'day' ? '' : 'none';
}

function updateDayNavLabel(monthKey, idx, total) {
  const [y, m] = monthKey.split('-');
  document.getElementById('chartDayNavLabel').textContent = `${MONTH_NL_FULL[parseInt(m, 10) - 1]} ${y}`;
  document.getElementById('btnDayPrev').disabled = idx <= 0;
  document.getElementById('btnDayNext').disabled = idx >= total - 1;
}

export function resetEnergyChartState() {
  _chartState = { level: 'month', dayMonthIdx: -1 };
  setActiveLevel('month');
}

function buildChartConfig(buckets, dualTariff) {
  const labels = buckets.map(b => b.label);
  const avgAfname   = buckets.length ? buckets.reduce((s, b) => s + b.afname,   0) / buckets.length : 0;
  const avgInjectie = buckets.length ? buckets.reduce((s, b) => s + b.injectie, 0) / buckets.length : 0;

  const datasets = [];
  if (dualTariff) {
    datasets.push({ type: 'bar', label: 'Afname dag',      data: buckets.map(b =>  b.afnamedag),    backgroundColor: '#e54545', stack: 'energy', order: 2 });
    datasets.push({ type: 'bar', label: 'Afname nacht',    data: buckets.map(b =>  b.afnamenacht),  backgroundColor: '#b02a2a', stack: 'energy', order: 2 });
    datasets.push({ type: 'bar', label: 'Injectie dag',    data: buckets.map(b => -b.injectiedag),  backgroundColor: '#00b478', stack: 'energy', order: 2 });
    datasets.push({ type: 'bar', label: 'Injectie nacht',  data: buckets.map(b => -b.injectienacht),backgroundColor: '#007a52', stack: 'energy', order: 2 });
  } else {
    datasets.push({ type: 'bar', label: 'Afname',   data: buckets.map(b =>  b.afname),   backgroundColor: '#e54545', stack: 'energy', order: 2 });
    datasets.push({ type: 'bar', label: 'Injectie', data: buckets.map(b => -b.injectie), backgroundColor: '#00b478', stack: 'energy', order: 2 });
  }
  datasets.push({ type: 'line', label: 'Gem. afname',   data: Array(labels.length).fill(avgAfname),    borderColor: '#7a1010', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 1 });
  datasets.push({ type: 'line', label: 'Gem. injectie', data: Array(labels.length).fill(-avgInjectie), borderColor: '#004d33', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 1 });

  return {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          ticks: {
            callback: v => Math.abs(v).toLocaleString('nl-BE', { maximumFractionDigits: 0 }) + ' kWh',
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${Math.abs(ctx.parsed.y).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} kWh`,
          },
        },
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            generateLabels: (chart) => {
              const defaults = window.Chart.defaults.plugins.legend.labels.generateLabels(chart);
              return defaults.map(item => {
                const ds = chart.data.datasets[item.datasetIndex];
                if (ds && ds.type === 'line') {
                  item.pointStyle = 'line';
                  item.lineDash = ds.borderDash || [6, 4];
                  item.strokeStyle = ds.borderColor;
                  item.fillStyle = ds.borderColor;
                  item.lineWidth = 2;
                }
                return item;
              });
            },
          },
        },
      },
    },
  };
}

export async function renderEnergyChart(d) {
  _lastChartData = d;
  const card = document.getElementById('energyChartCard');
  if (!card) return;
  const canvas = document.getElementById('energyChartCanvas');

  try {
    await window.SmartPeakChartLoader.loadChartJs();
  } catch (_) { /* fall through to Chart === undefined check */ }

  if (typeof window.Chart === 'undefined') {
    card.innerHTML = '<h2><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Afname &amp; Injectie over tijd</h2><div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation icon-warn" aria-hidden="true"></i> <div>Grafiek niet beschikbaar — Chart.js kon niet laden.</div></div>';
    card.style.display = '';
    return;
  }
  if (_energyChartInstance) {
    _energyChartInstance.destroy();
    _energyChartInstance = null;
  }

  const hasRealAllDays = Array.isArray(d.allDays);

  // Jaar-knop disable rule: require at least 1 complete calendar year in the data.
  const btnYear = document.getElementById('btnLevelYear');
  const btnDay  = document.getElementById('btnLevelDay');
  const yearBuckets = hasRealAllDays
    ? buildYearBuckets(d.allDays)
    : buildYearBucketsFromMonthMap(d.monthMap);
  if (yearBuckets.length === 0) {
    btnYear.disabled = true;
    btnYear.title = 'Onvoldoende data: minstens 1 volledig kalenderjaar nodig';
    if (_chartState.level === 'year') { _chartState.level = 'month'; setActiveLevel('month'); }
  } else {
    btnYear.disabled = false;
    btnYear.title = '';
  }
  // Dag-knop disable rule: require per-day data (real allDays array).
  if (!hasRealAllDays) {
    btnDay.disabled = true;
    btnDay.title = 'Dagniveau alleen beschikbaar bij nieuwere save-bestanden — upload de CSV opnieuw';
    if (_chartState.level === 'day') { _chartState.level = 'month'; setActiveLevel('month'); }
  } else {
    btnDay.disabled = false;
    btnDay.title = '';
  }

  let buckets;
  if (_chartState.level === 'year') {
    buckets = yearBuckets;
  } else if (_chartState.level === 'month') {
    if (hasRealAllDays) {
      const wd = Array.isArray(d.windowDays) ? d.windowDays : d.allDays.filter(x => x.date >= d.windowStart && x.date <= d.lastDate);
      buckets = buildMonthBuckets(wd);
    } else {
      // v1-v4 restored save: per-day data unavailable, fall back to monthMap-derived buckets.
      buckets = buildMonthBucketsFromMonthMap(d.monthMap);
    }
  } else /* day */ {
    const months = availableMonthKeys(d.allDays);
    if (_chartState.dayMonthIdx < 0 || _chartState.dayMonthIdx >= months.length) {
      _chartState.dayMonthIdx = months.length - 1;
    }
    buckets = buildDayBuckets(d.allDays, months[_chartState.dayMonthIdx]);
    updateDayNavLabel(months[_chartState.dayMonthIdx], _chartState.dayMonthIdx, months.length);
  }

  const cfg = buildChartConfig(buckets, d.dualTariff);
  _energyChartInstance = new window.Chart(canvas.getContext('2d'), cfg);
  card.style.display = '';
}

export function wireEnergyChartHandlers() {
  if (_chartHandlersWired) return;
  _chartHandlersWired = true;
  document.getElementById('btnLevelYear' ).addEventListener('click', () => { if (!_lastChartData) return; _chartState.level = 'year';  setActiveLevel('year');  renderEnergyChart(_lastChartData); });
  document.getElementById('btnLevelMonth').addEventListener('click', () => { if (!_lastChartData) return; _chartState.level = 'month'; setActiveLevel('month'); renderEnergyChart(_lastChartData); });
  document.getElementById('btnLevelDay'  ).addEventListener('click', () => { if (!_lastChartData) return; _chartState.level = 'day';   setActiveLevel('day');   renderEnergyChart(_lastChartData); });
  document.getElementById('btnDayPrev'   ).addEventListener('click', () => { if (!_lastChartData) return; _chartState.dayMonthIdx--; renderEnergyChart(_lastChartData); });
  document.getElementById('btnDayNext'   ).addEventListener('click', () => { if (!_lastChartData) return; _chartState.dayMonthIdx++; renderEnergyChart(_lastChartData); });
}

