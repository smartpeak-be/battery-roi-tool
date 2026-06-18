(() => {
  const script = document.currentScript;
  const mountId = script?.dataset.mount || 'smartpeak-reviews';
  const limit = Math.max(1, Math.min(24, Number(script?.dataset.limit || 6)));
  const projectId = 'smartpeak-projects';
  const api = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const root = document.getElementById(mountId);
  if (!root) return;

  const css = `
    .sp-review-widget{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e2a3a}
    .sp-review-widget__track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,1fr);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 12px}
    .sp-review-widget__card{scroll-snap-align:start;background:#fff;border:1px solid #dce3f0;border-radius:16px;padding:18px;box-shadow:0 10px 30px rgba(30,42,58,.08);min-height:190px}
    .sp-review-widget__stars{color:#f6a623;letter-spacing:1px;margin-bottom:10px}
    .sp-review-widget__text{font-size:1rem;line-height:1.5;margin:0 0 14px;white-space:pre-wrap}
    .sp-review-widget__name{font-weight:700;margin:0}.sp-review-widget__meta{font-size:.85rem;color:#6b7a99;margin:2px 0 0}
    @media(min-width:900px){.sp-review-widget__track{grid-auto-columns:calc((100% - 28px)/3)}}`;

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
      }))
      .filter(r => r.shortReview);

    if (!reviews.length) {
      root.innerHTML = '<div class="sp-review-widget"><p style="color:#6b7a99">Nog geen reviews gepubliceerd.</p></div>';
      return;
    }
    root.innerHTML = `
      <div class="sp-review-widget" aria-label="SmartPeak reviews">
        <div class="sp-review-widget__track">
          ${reviews.map(r => `
            <article class="sp-review-widget__card">
              <div class="sp-review-widget__stars" aria-label="${esc(r.rating)} op 5">${esc(stars(r.rating))}</div>
              <p class="sp-review-widget__text">“${esc(r.shortReview)}”</p>
              <p class="sp-review-widget__name">${esc(r.displayName)}</p>
              ${r.publishedLabel ? `<p class="sp-review-widget__meta">${esc(r.publishedLabel)}</p>` : ''}
            </article>`).join('')}
        </div>
      </div>`;
  }

  async function load() {
    injectCss();
    root.innerHTML = '<div class="sp-review-widget"><p style="color:#6b7a99">Reviews laden…</p></div>';
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
    root.innerHTML = '<div class="sp-review-widget"><p style="color:#6b7a99">Reviews konden niet geladen worden.</p></div>';
  });
})();
