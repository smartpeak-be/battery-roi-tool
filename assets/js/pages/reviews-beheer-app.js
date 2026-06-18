import { escapeHtml, showToast, showState, fmtDate, withSpinner } from '../shared-helpers.js';

let _reviews = [];

const STATUS_LABELS = {
  submitted: 'Nieuw',
  approved: 'Goedgekeurd intern',
  published: 'Gepubliceerd',
  rejected: 'Niet publiceren',
};

const STATUS_BADGES = {
  submitted: 'text-bg-warning',
  approved: 'text-bg-info',
  published: 'text-bg-success',
  rejected: 'text-bg-secondary',
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnSignIn').addEventListener('click', async () => {
    const errEl = document.getElementById('signInError');
    errEl.classList.add('hide');
    try {
      await signInWithGoogle();
    } catch (e) {
      errEl.textContent = 'Aanmelden mislukt: ' + (e && e.message ? e.message : e);
      errEl.classList.remove('hide');
    }
  });
  document.getElementById('btnSignOut').addEventListener('click', () => signOut());
  document.getElementById('btnSignOutNW').addEventListener('click', () => signOut());
  document.getElementById('btnRefreshReviews').addEventListener('click', () => refreshReviews());

  onAuthStateChanged(user => {
    if (!user) {
      showState('stateLoggedOut');
      return;
    }
    if (!isWhitelisted(user)) {
      document.getElementById('notWhitelistedEmail').textContent = user.email || '(onbekend)';
      showState('stateNotWhitelisted');
      return;
    }
    document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    showState('stateAuthorized');
    refreshReviews();
  });

  document.getElementById('reviewsModerationList').addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-review-action]');
    if (!btn) return;
    await handleReviewAction(btn.dataset.reviewAction, btn.dataset.reviewId, btn);
  });
});

async function refreshReviews() {
  const list = document.getElementById('reviewsModerationList');
  list.innerHTML = '<p class="sp-empty-state">⏳ Reviews laden…</p>';
  try {
    _reviews = await listSmartPeakReviews(100);
    renderStats();
    renderReviews();
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p class="sp-empty-state text-danger">Reviews laden mislukt: ${escapeHtml(e.message || e)}</p>`;
  }
}

function renderStats() {
  const counts = _reviews.reduce((acc, review) => {
    const status = review.status || 'submitted';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const stats = [
    ['submitted', 'Nieuwe reviews', 'fa-inbox'],
    ['published', 'Gepubliceerd', 'fa-globe'],
    ['approved', 'Intern goedgekeurd', 'fa-check'],
    ['rejected', 'Niet publiceren', 'fa-eye-slash'],
  ];
  document.getElementById('reviewStats').innerHTML = stats.map(([status, label, icon]) => `
    <div class="col-6 col-lg-3">
      <div class="card h-100"><div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="text-muted small">${escapeHtml(label)}</span>
          <i class="fa-solid ${icon} text-primary"></i>
        </div>
        <p class="h3 mb-0">${counts[status] || 0}</p>
      </div></div>
    </div>`).join('');
}

function renderReviews() {
  const list = document.getElementById('reviewsModerationList');
  if (!_reviews.length) {
    list.innerHTML = '<p class="sp-empty-state">Nog geen reviews ontvangen.</p>';
    return;
  }
  list.innerHTML = `
    <div class="sp-review-moderation-list">
      ${_reviews.map(reviewCardHtml).join('')}
    </div>`;
}

function reviewCardHtml(review) {
  const status = review.status || 'submitted';
  const consent = [];
  if (review.consentWebsite) consent.push('Website');
  if (review.consentSocials) consent.push('Socials');
  const created = formatTs(review.createdAt);
  return `
    <article class="sp-review-moderation-card" data-review-id="${escapeHtml(review.id)}">
      <div class="sp-review-moderation-main">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
          <div>
            <div class="sp-review-widget__stars" aria-label="${escapeHtml(review.rating || 0)} op 5">${escapeHtml(stars(review.rating))}</div>
            <h2 class="h5 mb-1">${escapeHtml(review.displayName || 'Naamloos')}</h2>
            <p class="text-muted small mb-0">${escapeHtml(review.originalProjectName || review.originalCustomerName || 'Geen projectnaam')} ${created ? `• ${escapeHtml(created)}` : ''}</p>
          </div>
          <span class="badge ${STATUS_BADGES[status] || 'text-bg-light'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
        </div>
        <blockquote class="sp-review-moderation-quote">${escapeHtml(review.shortReview || '')}</blockquote>
        ${review.privateFeedback ? `<div class="alert alert-light border py-2 mb-2"><strong>Privé feedback:</strong><br>${escapeHtml(review.privateFeedback)}</div>` : ''}
        <p class="text-muted small mb-0">Toestemming: ${consent.length ? escapeHtml(consent.join(', ')) : 'geen website/socials toestemming'}</p>
      </div>
      <div class="sp-review-moderation-actions">
        <button type="button" class="btn btn-success btn-sm" data-review-action="publish" data-review-id="${escapeHtml(review.id)}" ${review.consentWebsite ? '' : 'disabled title="Geen website-toestemming"'}>
          <i class="fa-solid fa-globe me-1"></i> Publiceren
        </button>
        <button type="button" class="btn btn-outline-primary btn-sm" data-review-action="approve" data-review-id="${escapeHtml(review.id)}">
          <i class="fa-solid fa-check me-1"></i> Intern OK
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-review-action="reject" data-review-id="${escapeHtml(review.id)}">
          <i class="fa-solid fa-eye-slash me-1"></i> Niet publiceren
        </button>
      </div>
    </article>`;
}

async function handleReviewAction(action, reviewId, btn) {
  const review = _reviews.find(r => r.id === reviewId);
  if (!review) return;
  const statusByAction = { publish: 'published', approve: 'approved', reject: 'rejected' };
  const status = statusByAction[action];
  if (!status) return;
  const extra = {};
  if (status === 'published') {
    extra.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
    extra.publishedLabel = 'Geverifieerde SmartPeak klant';
  }
  await withSpinner(btn, async () => {
    await updateSmartPeakReviewStatus(reviewId, status, extra);
    showToast(`Review ${STATUS_LABELS[status].toLowerCase()}.`, 'success');
    await refreshReviews();
  }, 'Opslaan…');
}

function stars(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

function formatTs(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return fmtDate(value.toDate());
  if (value instanceof Date) return fmtDate(value);
  if (typeof value === 'string') return fmtDate(new Date(value));
  return '';
}
