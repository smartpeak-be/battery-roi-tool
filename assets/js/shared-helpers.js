// Shared UI helpers — ES module.
// Used by dashboard.html, project-edit.html, index.html.

// --- HTML/Security ---

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// --- String utils ---

export function shortEmail(e) { return e ? String(e).split('@')[0] : '\u2014'; }

// --- Global Spinner ---

/**
 * Lazily creates and returns the global spinner overlay element.
 * DOM is injected once at `<body>` level.
 */
function _ensureSpinnerEl() {
  let el = document.getElementById('spGlobalSpinner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'spGlobalSpinner';
  el.className = 'sp-spinner-overlay';
  el.innerHTML = `
    <div class="sp-spinner-content">
      <div class="sp-spinner-ring"></div>
      <div class="sp-spinner-message"></div>
      <div class="sp-spinner-progress">
        <div class="progress"><div class="progress-bar" role="progressbar" style="width:0%"></div></div>
        <div class="sp-spinner-count"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

/**
 * Show a global centered spinner overlay that blocks all UI interaction.
 * @param {Object} [opts]
 * @param {string} [opts.message]  — text shown below the spinner ring
 * @param {boolean} [opts.progress] — show progress bar
 * @param {number}  [opts.current]  — current item (e.g. 3)
 * @param {number}  [opts.total]    — total items (e.g. 10)
 */
export function showSpinner(opts) {
  const el  = _ensureSpinnerEl();
  const msg = el.querySelector('.sp-spinner-message');
  const prg = el.querySelector('.sp-spinner-progress');
  const bar = el.querySelector('.sp-spinner-progress .progress-bar');
  const cnt = el.querySelector('.sp-spinner-count');

  msg.textContent = (opts && opts.message) || '';

  if (opts && opts.progress) {
    prg.classList.add('active');
    const pct = (opts.total > 0) ? Math.round(((opts.current || 0) / opts.total) * 100) : 0;
    bar.style.width = pct + '%';
    cnt.textContent = (opts.current || 0) + ' van ' + (opts.total || 0) + ' geüpload';
  } else {
    prg.classList.remove('active');
    bar.style.width = '0%';
    cnt.textContent = '';
  }

  el.classList.add('active');
}

/**
 * Update spinner message / progress without hiding it.
 * @param {Object} opts — same shape as showSpinner opts
 */
export function updateSpinner(opts) {
  const el = document.getElementById('spGlobalSpinner');
  if (!el || !el.classList.contains('active')) return;

  if (opts.message !== undefined) {
    el.querySelector('.sp-spinner-message').textContent = opts.message;
  }
  if (opts.progress !== undefined) {
    const prg = el.querySelector('.sp-spinner-progress');
    if (opts.progress) prg.classList.add('active');
    else               prg.classList.remove('active');
  }
  if (opts.current !== undefined && opts.total !== undefined) {
    const bar = el.querySelector('.sp-spinner-progress .progress-bar');
    const cnt = el.querySelector('.sp-spinner-count');
    const pct = opts.total > 0 ? Math.round((opts.current / opts.total) * 100) : 0;
    bar.style.width = pct + '%';
    cnt.textContent = opts.current + ' van ' + opts.total + ' geüpload';
  }
}

/** Hide the global spinner overlay. Safe to call when already hidden. */
export function hideSpinner() {
  const el = document.getElementById('spGlobalSpinner');
  if (el) el.classList.remove('active');
}

/**
 * Convenience wrapper: show spinner, await fn(), hide spinner.
 * On error the spinner is still hidden; the error is re-thrown.
 * @param {Function} fn  — async function to execute
 * @param {Object}  [opts] — passed to showSpinner
 * @returns {Promise<*>} result of fn()
 */
export async function withSpinner(fn, opts) {
  showSpinner(opts);
  try {
    return await fn();
  } finally {
    hideSpinner();
  }
}

// --- Modal confirmations ---

function _ensureConfirmStyles() {
  if (document.getElementById('spConfirmStyles')) return;
  const style = document.createElement('style');
  style.id = 'spConfirmStyles';
  style.textContent = `
    .sp-confirm-backdrop{position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}
    .sp-confirm-dialog{width:min(100%,460px);background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(15,23,42,.28);overflow:hidden;color:#1e2a3a}
    .sp-confirm-header{padding:20px 22px 8px;font-weight:700;font-size:1.08rem}
    .sp-confirm-body{padding:0 22px 18px;color:#52627a;white-space:pre-wrap;line-height:1.45}
    .sp-confirm-actions{display:flex;gap:10px;justify-content:flex-end;padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;flex-wrap:wrap}
    .sp-confirm-btn{border:1px solid #cbd5e1;background:#fff;color:#1e2a3a;border-radius:10px;padding:8px 14px;font-weight:600;cursor:pointer}
    .sp-confirm-btn:hover{background:#f1f5f9}
    .sp-confirm-btn.primary{background:#2c7be5;border-color:#2c7be5;color:#fff}
    .sp-confirm-btn.primary:hover{background:#1a5fba}
    .sp-confirm-btn.danger{background:#dc2626;border-color:#dc2626;color:#fff}
    .sp-confirm-btn.danger:hover{background:#b91c1c}
    .sp-confirm-btn.warning{background:#f59e0b;border-color:#f59e0b;color:#111827}
    .sp-confirm-btn.warning:hover{background:#d97706}
  `;
  document.head.appendChild(style);
}

export function showConfirm(opts = {}) {
  _ensureConfirmStyles();
  const actions = Array.isArray(opts.actions) && opts.actions.length
    ? opts.actions
    : [
        { value: false, label: opts.cancelText || 'Annuleren', variant: 'secondary' },
        { value: true, label: opts.confirmText || 'Bevestigen', variant: opts.variant || 'primary', autofocus: true },
      ];

  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sp-confirm-backdrop';
    backdrop.setAttribute('role', 'presentation');
    const title = opts.title || 'Bevestigen';
    const message = opts.message || '';
    backdrop.innerHTML = `
      <div class="sp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="spConfirmTitle">
        <div class="sp-confirm-header" id="spConfirmTitle">${escapeHtml(title)}</div>
        ${message ? `<div class="sp-confirm-body">${escapeHtml(message)}</div>` : ''}
        <div class="sp-confirm-actions"></div>
      </div>
    `;
    const actionsEl = backdrop.querySelector('.sp-confirm-actions');
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      resolve(value);
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') close(opts.cancelValue !== undefined ? opts.cancelValue : false);
    };
    actions.forEach((action, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sp-confirm-btn ${action.variant || ''}`.trim();
      btn.textContent = action.label || String(action.value);
      btn.addEventListener('click', () => close(action.value));
      actionsEl.appendChild(btn);
      if (action.autofocus || (!actions.some(a => a.autofocus) && idx === actions.length - 1)) {
        setTimeout(() => btn.focus(), 0);
      }
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(opts.cancelValue !== undefined ? opts.cancelValue : false);
    });
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(backdrop);
  });
}

// --- UI Feedback ---

/**
 * Show a Bootstrap 5 toast. Requires a #toastContainer element in the DOM.
 * Variants: 'primary' | 'success' | 'danger' | 'warning'
 */
export function showToast(message, variant = 'primary') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const id = 't_' + Date.now();
  const html = `
    <div id="${id}" class="toast text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Sluiten"></button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
  const el = document.getElementById(id);
  const t = bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

// --- Auth UI ---

export function showState(which) {
  ['stateLoggedOut', 'stateNotWhitelisted', 'stateAuthorized'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hide', id !== which);
  });
}

// --- Date Formatting (Firestore Timestamps) ---

export function fmtDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '\u2014';
  return ts.toDate().toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '\u2014';
  return ts.toDate().toLocaleString('nl-BE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

export function fmtRelTime(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '\u2014';
  const date = ts.toDate();
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60)     return 'net nu';
  if (diffSec < 3600)   return Math.floor(diffSec / 60) + ' min geleden';
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return 'vandaag ' + date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'gisteren ' + date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }) +
         ' ' + date.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

// Expose on window for non-module scripts (offertes-ui.js, photo-uploader.js)
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.showToast = showToast;
  window.showSpinner = showSpinner;
  window.updateSpinner = updateSpinner;
  window.hideSpinner = hideSpinner;
  window.withSpinner = withSpinner;
  window.showConfirm = showConfirm;
}
