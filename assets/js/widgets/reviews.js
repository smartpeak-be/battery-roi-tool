(() => {
  const script = document.currentScript;
  const mountId = script?.dataset.mount || 'smartpeak-reviews';
  const limit = Math.max(1, Math.min(24, Number(script?.dataset.limit || 6)));
  const projectId = 'smartpeak-projects';
  const api = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const root = document.getElementById(mountId);
  if (!root) return;

  const css = `
    .sp-review-widget{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e2a3a;position:relative}
    .sp-review-widget__header{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}
    .sp-review-widget__nav{border:1px solid #dce3f0;background:#fff;border-radius:999px;width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 22px rgba(30,42,58,.08)}
    .sp-review-widget__nav:hover{background:#f0f4fb}.sp-review-widget__nav:focus-visible{outline:2px solid #2c7be5;outline-offset:2px}
    .sp-review-widget__track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(270px,1fr);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px;scroll-behavior:smooth;scrollbar-width:thin}
    .sp-review-widget__card{scroll-snap-align:start;background:#fff;border:1px solid #dce3f0;border-radius:20px;padding:20px;box-shadow:0 16px 42px rgba(30,42,58,.10);min-height:210px;display:flex;flex-direction:column}
    .sp-review-widget__photo{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px;margin:0 0 14px;border:1px solid #edf1f7;background:#f7f9fd}
    .sp-review-widget__stars{color:#f6a623;letter-spacing:1px;margin-bottom:10px;font-size:1.05rem}
    .sp-review-widget__text{font-size:1rem;line-height:1.55;margin:0 0 16px;white-space:pre-wrap;flex:1}
    .sp-review-widget__scores{display:grid;gap:7px;margin:0 0 16px;padding:12px;border-radius:14px;background:#f7f9fd;border:1px solid #edf1f7}
    .sp-review-widget__solution{font-size:.86rem;color:#40506a;background:#edf7f2;border:1px solid #ccebdd;border-radius:999px;padding:7px 10px;margin:0 0 12px;display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:100%}
    .sp-review-widget__score{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.86rem;color:#40506a}
    .sp-review-widget__score-label{font-weight:650}.sp-review-widget__score-stars{color:#f6a623;letter-spacing:.5px;white-space:nowrap;font-size:.82rem}
    .sp-review-widget__name{font-weight:800;margin:0}.sp-review-widget__meta{font-size:.85rem;color:#6b7a99;margin:2px 0 0}
    .sp-review-widget__empty{color:#6b7a99;background:#fff;border:1px dashed #dce3f0;border-radius:16px;padding:18px}
    @media(min-width:900px){.sp-review-widget__track{grid-auto-columns:calc((100% - 32px)/3)}}`;

  function injectCss() {
    if (document.getElementById('sp-review-widget-css')) return;
    const style = document.createElement('style');
    style.id = 'sp-review-widget-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fieldValue(fields, key, fallback = '') {
    const f = fields?.[key];
    if (!f) return fallback;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('doubleValue' in f) return Number(f.doubleValue);
    if ('booleanValue' in f) return Boolean(f.booleanValue);
    if ('timestampValue' in f) return f.timestampValue;
    if ('mapValue' in f) return mapValue(f.mapValue.fields || {});
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(value => fieldValue({ value }, 'value'));
    return fallback;
  }

  function mapValue(fields) {
    return Object.fromEntries(Object.keys(fields || {}).map(key => [key, fieldValue(fields, key)]));
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function stars(rating) {
    const n = Math.max(1, Math.min(5, Number(rating) || 5));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function scoreRows(review) {
    return [
      ['Communicatie', review.ratingCommunication],
      ['Planning', review.ratingPlanning],
      ['Installatie', review.ratingInstallation],
      ['Afwerking', review.ratingFinish],
    ]
      .filter(([, value]) => Number(value) >= 1)
      .map(([label, value]) => `
        <div class="sp-review-widget__score">
          <span class="sp-review-widget__score-label">${esc(label)}</span>
          <span class="sp-review-widget__score-stars" aria-label="${esc(value)} op 5">${esc(stars(value))}</span>
        </div>`)
      .join('');
  }

  function solutionLabel(summary) {
    if (!summary || typeof summary !== 'object') return '';
    if (summary.publicLabel) return String(summary.publicLabel);
    const parts = [];
    if (Number(summary.inverterPowerW) > 0) parts.push(`geplaatst omvormvermogen ${Math.round(Number(summary.inverterPowerW))} W`);
    if (Number(summary.storageKwh) > 0) parts.push(`geplaatste opslag ${Math.round(Number(summary.storageKwh) * 100) / 100} kWh`);
    return parts.join(' · ');
  }

  function reviewPhotoUrl(review) {
    if (!review.reviewPhotosPublic || !Array.isArray(review.reviewPhotos)) return '';
    const photo = review.reviewPhotos.find(p => p && (p.thumbUrl || p.downloadUrl));
    return photo ? (photo.thumbUrl || photo.downloadUrl || '') : '';
  }

  function render(rows) {
    const reviews = rows
      .map(row => row.document?.fields)
      .filter(Boolean)
      .map(fields => ({
        displayName: fieldValue(fields, 'displayName', 'SmartPeak klant'),
        rating: fieldValue(fields, 'rating', 5),
        ratingCommunication: fieldValue(fields, 'ratingCommunication', 0),
        ratingPlanning: fieldValue(fields, 'ratingPlanning', 0),
        ratingInstallation: fieldValue(fields, 'ratingInstallation', 0),
        ratingFinish: fieldValue(fields, 'ratingFinish', 0),
        shortReview: fieldValue(fields, 'shortReview', ''),
        solutionSummary: fieldValue(fields, 'solutionSummary', null),
        reviewPhotos: fieldValue(fields, 'reviewPhotos', []),
        reviewPhotosPublic: fieldValue(fields, 'reviewPhotosPublic', false),
        publishedLabel: fieldValue(fields, 'publishedLabel', ''),
        createdAt: fieldValue(fields, 'createdAt', ''),
        publishedAt: fieldValue(fields, 'publishedAt', ''),
      }))
      .filter(r => r.shortReview)
      .sort((a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)))
      .slice(0, limit);

    if (!reviews.length) {
      root.innerHTML = '<div class="sp-review-widget"><p class="sp-review-widget__empty">Nog geen reviews gepubliceerd.</p></div>';
      return;
    }
    root.innerHTML = `
      <div class="sp-review-widget" aria-label="SmartPeak reviews">
        <div class="sp-review-widget__header" aria-label="Carousel navigatie">
          <button type="button" class="sp-review-widget__nav" data-sp-review-prev aria-label="Vorige reviews">‹</button>
          <button type="button" class="sp-review-widget__nav" data-sp-review-next aria-label="Volgende reviews">›</button>
        </div>
        <div class="sp-review-widget__track" tabindex="0">
          ${reviews.map(r => `
            <article class="sp-review-widget__card">
              ${reviewPhotoUrl(r) ? `<img class="sp-review-widget__photo" src="${esc(reviewPhotoUrl(r))}" alt="Foto van SmartPeak installatie" loading="lazy">` : ''}
              <div class="sp-review-widget__stars" aria-label="${esc(r.rating)} op 5">${esc(stars(r.rating))}</div>
              <p class="sp-review-widget__text">“${esc(r.shortReview)}”</p>
              ${solutionLabel(r.solutionSummary) ? `<p class="sp-review-widget__solution">⚡ ${esc(solutionLabel(r.solutionSummary))}</p>` : ''}
              ${scoreRows(r) ? `<div class="sp-review-widget__scores" aria-label="Deelscores review">${scoreRows(r)}</div>` : ''}
              <p class="sp-review-widget__name">${esc(r.displayName)}</p>
              ${r.publishedLabel ? `<p class="sp-review-widget__meta">${esc(r.publishedLabel)}</p>` : ''}
            </article>`).join('')}
        </div>
      </div>`;
    const track = root.querySelector('.sp-review-widget__track');
    root.querySelector('[data-sp-review-prev]')?.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.9, behavior: 'smooth' }));
    root.querySelector('[data-sp-review-next]')?.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.9, behavior: 'smooth' }));
  }

  async function load() {
    injectCss();
    root.innerHTML = '<div class="sp-review-widget"><p class="sp-review-widget__empty">Reviews laden…</p></div>';
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'reviews' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
          { fieldFilter: { field: { fieldPath: 'consentWebsite' }, op: 'EQUAL', value: { booleanValue: true } } }
        ] } },
        limit,
      }
    };
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Firestore ${res.status}`);
    render(await res.json());
  }

  load().catch(err => {
    console.warn('SmartPeak reviews laden mislukt', err);
    root.innerHTML = '<div class="sp-review-widget"><p class="sp-review-widget__empty">Reviews konden niet geladen worden.</p></div>';
  });
})();
