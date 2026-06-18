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
    .sp-review-widget__stars{color:#f6a623;letter-spacing:1px;margin-bottom:10px;font-size:1.05rem}
    .sp-review-widget__text{font-size:1rem;line-height:1.55;margin:0 0 16px;white-space:pre-wrap;flex:1}
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
    return fallback;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function stars(rating) {
    const n = Math.max(1, Math.min(5, Number(rating) || 5));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function render(rows) {
    const reviews = rows
      .map(row => row.document?.fields)
      .filter(Boolean)
      .map(fields => ({
        displayName: fieldValue(fields, 'displayName', 'SmartPeak klant'),
        rating: fieldValue(fields, 'rating', 5),
        shortReview: fieldValue(fields, 'shortReview', ''),
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
              <div class="sp-review-widget__stars" aria-label="${esc(r.rating)} op 5">${esc(stars(r.rating))}</div>
              <p class="sp-review-widget__text">“${esc(r.shortReview)}”</p>
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
