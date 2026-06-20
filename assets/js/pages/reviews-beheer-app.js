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
        ${reviewSolutionHtml(review)}
        ${reviewPhotosHtml(review)}
        ${reviewRatingsHtml(review)}
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
        <button type="button" class="btn btn-outline-danger btn-sm" data-review-action="delete" data-review-id="${escapeHtml(review.id)}">
          <i class="fa-solid fa-trash-can me-1"></i> Verwijderen
        </button>
      </div>
    </article>`;
}

function reviewSolutionHtml(review) {
  const summary = review.solutionSummary || {};
  const label = summary.publicLabel || [
    Number(summary.inverterPowerW) > 0 ? `geplaatst omvormvermogen ${Math.round(Number(summary.inverterPowerW))} W` : '',
    Number(summary.storageKwh) > 0 ? `geplaatste opslag ${Math.round(Number(summary.storageKwh) * 100) / 100} kWh` : '',
  ].filter(Boolean).join(' · ');
  return label ? `<p class="badge text-bg-primary-subtle border text-primary-emphasis mb-2"><i class="fa-solid fa-car-battery me-1"></i>${escapeHtml(label)}</p>` : '';
}

function reviewPhotosHtml(review) {
  const photos = Array.isArray(review.reviewPhotos) ? review.reviewPhotos : [];
  if (!photos.length) return '';
  return `<p class="text-muted small mb-2"><i class="fa-solid fa-camera me-1"></i>${photos.length} eindfoto(s) mee ingestuurd en als afgewerkt getagd bij het project.</p>`;
}

function reviewRatingsHtml(review) {
  const ratings = [
    ['Communicatie', review.ratingCommunication],
    ['Planning en afspraken', review.ratingPlanning],
    ['Installatie', review.ratingInstallation],
    ['Afwerking en netheid', review.ratingFinish],
  ].filter(([, value]) => Number(value) > 0);
  if (!ratings.length) return '';
  return `
    <div class="d-flex flex-wrap gap-2 mb-2">
      ${ratings.map(([label, value]) => `
        <span class="badge text-bg-light border">${escapeHtml(label)}: ${escapeHtml(stars(value))}</span>
      `).join('')}
    </div>`;
}

async function handleReviewAction(action, reviewId, btn) {
  const review = _reviews.find(r => r.id === reviewId);
  if (!review) return;
  if (action === 'delete') {
    const confirmed = window.confirm('Review definitief verwijderen? Dit kan niet ongedaan gemaakt worden.');
    if (!confirmed) return;
    const deleted = await runReviewButtonAction(btn, 'Verwijderen…', 'Review verwijderen…', async () => {
      await deleteSmartPeakReview(reviewId);
      await refreshReviews();
    });
    if (deleted) showToast('Review verwijderd.', 'success');
    return;
  }
  const statusByAction = { publish: 'published', approve: 'approved', reject: 'rejected' };
  const status = statusByAction[action];
  if (!status) return;
  const extra = {};
  if (status === 'published') {
    extra.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
    extra.publishedLabel = 'Geverifieerde SmartPeak klant';
  }
  const saved = await runReviewButtonAction(btn, 'Opslaan…', 'Reviewstatus opslaan…', async () => {
    await updateSmartPeakReviewStatus(reviewId, status, extra);
    await refreshReviews();
  });
  if (saved) showToast(`Review ${STATUS_LABELS[status].toLowerCase()}.`, 'success');
}

async function runReviewButtonAction(btn, loadingLabel, spinnerMessage, action) {
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> ${escapeHtml(loadingLabel)}`;
  try {
    await withSpinner(action, { message: spinnerMessage });
    return true;
  } catch (e) {
    console.error(e);
    showToast(`Reviewactie mislukt: ${e.message || e}`, 'danger');
    return false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
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
