import { escapeHtml, showToast, withSpinner } from '../shared-helpers.js';
import { solutionSummaryLabel } from '../project-solution.js';

const FALLBACK_GOOGLE_REVIEW_URL = 'https://www.google.com/search?q=SmartPeak+review';
const container = document.getElementById('reviewContainer');

let requestId = '';
let reviewRequest = null;
let uploadedReviewPhotos = [];

function submittedReviewStorageKey(id) {
  return `smartpeak-review-submitted-${id}`;
}

function rememberSubmittedReview(id, review) {
  try {
    window.localStorage.setItem(submittedReviewStorageKey(id), JSON.stringify({
      id: review.id || '',
      shortReview: review.shortReview || '',
    }));
  } catch (e) {
    console.warn('Reviewtekst lokaal bewaren mislukt', e);
  }
}

function readRememberedSubmittedReview(id) {
  try {
    const raw = window.localStorage.getItem(submittedReviewStorageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getRequestId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('r') || params.get('id') || window.location.hash.replace(/^#/, '');
}

function renderError(message) {
  container.innerHTML = `
    <section class="card shadow-sm border-0">
      <div class="card-body p-4 text-center">
        <div class="display-6 mb-3 text-primary"><i class="fa-solid fa-bolt"></i></div>
        <h1 class="h4">Reviewlink niet gevonden</h1>
        <p class="text-muted mb-0">${escapeHtml(message)}</p>
      </div>
    </section>`;
}

function starInputHtml(name = 'rating', label = 'Score') {
  return `
    <div class="sp-star-rating" role="radiogroup" aria-label="${escapeHtml(label)}">
      ${[5, 4, 3, 2, 1].map(value => `
        <input type="radio" id="${escapeHtml(name)}-${value}" name="${escapeHtml(name)}" value="${value}" ${value === 5 ? 'checked' : ''}>
        <label for="${escapeHtml(name)}-${value}" title="${value} op 5"><i class="fa-solid fa-star"></i></label>
      `).join('')}
    </div>`;
}

function extraRatingHtml(name, label) {
  return `
    <div class="col-md-6">
      <label class="form-label fw-semibold d-block mb-1">${escapeHtml(label)}</label>
      ${starInputHtml(name, label)}
    </div>`;
}

function displayNameFromRequest(req) {
  return req.suggestedDisplayName || req.originalCustomerName || req.originalProjectName || '';
}

function googleTextFallback() {
  return 'Vertel kort hoe je de samenwerking met SmartPeak hebt ervaren. Je kan bijvoorbeeld iets schrijven over de installatie, de communicatie en wat je anderen zou meegeven.';
}

function solutionSummaryHtml(req) {
  const label = solutionSummaryLabel(req.solutionSummary || {});
  if (!label) return '';
  return `
    <section class="sp-review-section">
      <div class="alert alert-primary-subtle border border-primary-subtle mb-0">
        <i class="fa-solid fa-car-battery me-1"></i>
        <strong>Gekozen oplossing:</strong> ${escapeHtml(label)}
      </div>
    </section>`;
}

function renderForm(req) {
  const displayName = displayNameFromRequest(req);
  const googleText = googleTextFallback(req);
  container.innerHTML = `
    <section class="sp-review-hero card shadow-sm border-0 overflow-hidden">
      <div class="card-body p-4 p-md-5">
        <div class="d-flex align-items-center gap-2 mb-3 text-primary fw-semibold">
          <i class="fa-solid fa-bolt"></i> SmartPeak
        </div>
        <h1 class="display-6 fw-bold mb-3">Hoe heb je onze samenwerking ervaren?</h1>
        <p class="lead text-muted mb-2">Je installatie zit erop en je batterij is live. Vanaf nu kan je je eigen energie slimmer opslaan en gebruiken.</p>
        <p class="text-muted mb-0">We hopen dat alles vlot verlopen is. Als je wil, mag je hieronder een korte review achterlaten. Kort en eerlijk is perfect.</p>
      </div>
    </section>

    <form id="reviewForm" class="sp-review-card card shadow-sm border-0 mt-3">
      <div class="card-body p-4 p-md-5">
        <input type="hidden" name="requestId" value="${escapeHtml(requestId)}">

        ${solutionSummaryHtml(req)}

        <section class="sp-review-section">
          <label for="displayName" class="form-label fw-semibold">Naam die bij de review mag staan</label>
          <input id="displayName" name="displayName" class="form-control form-control-lg" maxlength="120" value="${escapeHtml(displayName)}" autocomplete="name">
        </section>

        <fieldset class="sp-review-section">
          <legend class="form-label fw-semibold mb-1">Hoe mogen we je review tonen?</legend>
          <p class="text-muted small mb-3">Je kan je review met je naam laten tonen, of liever anoniem als “SmartPeak klant”. Kies vooral wat voor jou goed voelt.</p>
          <div class="sp-review-choice-list">
            <label class="sp-review-choice" for="nameVisibilityFull">
              <input class="form-check-input" type="radio" name="nameVisibility" id="nameVisibilityFull" value="full" checked>
              <span>
                <strong>Met mijn naam</strong>
                <small>We tonen je volledige naam bij je review op onze website.</small>
              </span>
            </label>
            <label class="sp-review-choice" for="nameVisibilityAnonymous">
              <input class="form-check-input" type="radio" name="nameVisibility" id="nameVisibilityAnonymous" value="anonymous">
              <span>
                <strong>Anoniem</strong>
                <small>We plaatsen je review als “SmartPeak klant”.</small>
              </span>
            </label>
          </div>
        </fieldset>

        <section class="sp-review-section sp-review-section--score">
          <label class="form-label fw-semibold d-block">Algemene score</label>
          ${starInputHtml()}
        </section>

        <section class="sp-review-section">
          <label class="form-label fw-semibold d-block">Waarvoor geef je ons welke score?</label>
          <div class="row g-3">
            ${extraRatingHtml('ratingCommunication', 'Communicatie')}
            ${extraRatingHtml('ratingPlanning', 'Planning en afspraken')}
            ${extraRatingHtml('ratingInstallation', 'Installatie')}
            ${extraRatingHtml('ratingFinish', 'Afwerking en netheid')}
          </div>
        </section>

        <section class="sp-review-section">
          <label for="shortReview" class="form-label fw-semibold">Als je dit kort zou samenvatten, wat mag er dan als review staan?</label>
          <textarea id="shortReview" name="shortReview" class="form-control" rows="4" maxlength="1200" placeholder="${escapeHtml(googleText)}" required></textarea>
        </section>

        <section class="sp-review-section">
          <label for="privateFeedback" class="form-label fw-semibold">Extra feedback voor ons <span class="text-muted fw-normal">(optioneel)</span></label>
          <textarea id="privateFeedback" name="privateFeedback" class="form-control" rows="3" maxlength="2000" placeholder="Wat liep goed? Wat kan beter?"></textarea>
          <div class="form-text">Dit is enkel voor ons en komt niet publiek bij je review.</div>
        </section>

        <section class="sp-review-section">
          <label for="reviewPhotos" class="form-label fw-semibold">Foto's van het eindresultaat <span class="text-muted fw-normal">(optioneel)</span></label>
          <input id="reviewPhotos" name="reviewPhotos" class="form-control" type="file" accept="image/*" capture="environment" multiple>
          <div class="form-text">Je mag rechtstreeks foto’s nemen of bestaande foto’s opladen. Maximaal 8 foto’s.</div>
          <div id="reviewPhotoStatus" class="small text-muted mt-2"></div>
        </section>

        <div class="sp-review-note mb-4">
          <strong>Transparantie is belangrijk voor ons.</strong><br>
          We streven ernaar dat elke klant tevreden is wanneer we een installatie afronden. Is er volgens jou toch nog iets niet helemaal in orde, of kunnen we nog iets voor je betekenen? Laat het ons dan gerust eerst weten via telefoon of mail, voor je je review definitief op punt zet. Zo kunnen we het nog bekijken en waar nodig rechtzetten. Een eerlijke review mag uiteraard altijd, ook als er verbeterpunten zijn. Reviews die we op onze website tonen, publiceren we pas na goedkeuring en met respectvolle formulering.
        </div>

        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" value="1" id="consentWebsite" name="consentWebsite" checked>
          <label class="form-check-label" for="consentWebsite">SmartPeak mag mijn review gebruiken op de website.</label>
        </div>
        <div class="form-check mb-4">
          <input class="form-check-input" type="checkbox" value="1" id="consentSocials" name="consentSocials">
          <label class="form-check-label" for="consentSocials">SmartPeak mag mijn review eventueel gebruiken op sociale media.</label>
        </div>

        <button class="btn btn-primary btn-lg w-100" type="submit">
          <i class="fa-solid fa-paper-plane me-1"></i> Review doorsturen
        </button>
      </div>
    </form>`;

  const form = document.getElementById('reviewForm');
  const displayNameInput = document.getElementById('displayName');
  form.addEventListener('change', event => {
    if (event.target && event.target.name === 'nameVisibility') {
      const anonymous = form.elements.nameVisibility.value === 'anonymous';
      displayNameInput.disabled = anonymous;
      displayNameInput.closest('.sp-review-section')?.classList.toggle('opacity-50', anonymous);
    }
  });
  document.getElementById('reviewPhotos')?.addEventListener('change', uploadSelectedReviewPhotos);
  form.addEventListener('submit', submitForm);
}

async function uploadSelectedReviewPhotos(event) {
  const files = Array.from(event.target.files || []).slice(0, 8);
  const status = document.getElementById('reviewPhotoStatus');
  uploadedReviewPhotos = [];
  if (!files.length) {
    if (status) status.textContent = '';
    return;
  }
  await withSpinner(async () => {
    for (let i = 0; i < files.length; i++) {
      if (status) status.textContent = `Foto ${i + 1}/${files.length} uploaden…`;
      const meta = await window.uploadReviewPhotoWithThumb(requestId, files[i]);
      uploadedReviewPhotos.push(meta);
    }
  }, { message: 'Foto’s uploaden…' });
  if (status) status.textContent = `${uploadedReviewPhotos.length} foto(s) klaar om mee te sturen.`;
}

function renderThanks(review) {
  const text = review.shortReview || '';
  const textHtml = text
    ? `<div class="sp-google-copy text-start mb-3">${escapeHtml(text)}</div>`
    : '<p class="text-muted mb-3">We hebben je review goed ontvangen.</p>';
  container.innerHTML = `
    <section class="card shadow-sm border-0">
      <div class="card-body p-4 p-md-5 text-center">
        <div class="display-5 text-success mb-3"><i class="fa-solid fa-circle-check"></i></div>
        <h1 class="h3 fw-bold mb-3">Merci voor je feedback!</h1>
        <p class="text-muted mb-4">Je review is bewaard. Deze link is nu afgesloten zodat er maar één review per link binnenkomt.</p>
        ${textHtml}
        <div class="alert alert-light border text-start mb-3">
          <strong>Google review komt eraan.</strong><br>
          De Google review-knop staat voorlopig nog uit terwijl we deze koppeling afwerken.
        </div>
        <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
          ${text ? '<button class="btn btn-outline-primary btn-lg" id="copyReviewBtn" type="button"><i class="fa-solid fa-copy me-1"></i> Tekst kopiëren</button>' : ''}
          <button class="btn btn-primary btn-lg" id="googleReviewBtn" type="button" disabled aria-disabled="true"><i class="fa-brands fa-google me-1"></i> Google review in opbouw</button>
        </div>
      </div>
    </section>`;
  document.getElementById('copyReviewBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Reviewtekst gekopieerd.', 'success');
    } catch {
      showToast('Kopiëren mislukt. Selecteer de tekst manueel.', 'warning');
    }
  });
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const readRating = name => Number(data.get(name)) || 0;
  const rating = readRating('rating');
  const nameVisibility = String(data.get('nameVisibility') || 'full');
  const publicDisplayName = nameVisibility === 'anonymous'
    ? 'SmartPeak klant'
    : String(data.get('displayName') || '').trim();
  const payload = {
    requestId,
    projectId: reviewRequest.projectId || null,
    originalProjectName: reviewRequest.originalProjectName || '',
    originalCustomerName: reviewRequest.originalCustomerName || '',
    displayName: publicDisplayName,
    rating,
    ratingCommunication: readRating('ratingCommunication'),
    ratingPlanning: readRating('ratingPlanning'),
    ratingInstallation: readRating('ratingInstallation'),
    ratingFinish: readRating('ratingFinish'),
    shortReview: String(data.get('shortReview') || '').trim(),
    privateFeedback: String(data.get('privateFeedback') || '').trim(),
    solutionSummary: reviewRequest.solutionSummary || null,
    reviewPhotos: uploadedReviewPhotos,
    consentWebsite: data.get('consentWebsite') === '1',
    consentSocials: data.get('consentSocials') === '1',
    googleReviewUrl: reviewRequest.googleReviewUrl || FALLBACK_GOOGLE_REVIEW_URL,
  };

  if (!payload.shortReview) {
    showToast('Vul eerst een korte reviewtekst in.', 'warning');
    return;
  }
  if (payload.rating < 1 || payload.rating > 5) {
    showToast('Kies een score van 1 tot 5 sterren.', 'warning');
    return;
  }
  const extraRatings = [payload.ratingCommunication, payload.ratingPlanning, payload.ratingInstallation, payload.ratingFinish];
  if (extraRatings.some(value => value < 1 || value > 5)) {
    showToast('Kies overal een score van 1 tot 5 sterren.', 'warning');
    return;
  }

  await withSpinner(async () => {
    try {
      const reviewId = await submitSmartPeakReview(payload);
      const submittedReview = { id: reviewId, ...payload };
      rememberSubmittedReview(requestId, submittedReview);
      renderThanks(submittedReview);
    } catch (e) {
      showToast('Review bewaren mislukt: ' + (e && e.message ? e.message : e), 'danger');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  requestId = getRequestId();
  if (!requestId) {
    renderError('Er ontbreekt een reviewcode in de link.');
    return;
  }
  try {
    reviewRequest = await getReviewRequest(requestId);
    if (!reviewRequest || reviewRequest.status === 'closed') {
      renderError('Deze reviewlink is niet meer actief.');
      return;
    }
    if (reviewRequest.submittedAt || reviewRequest.latestReviewId) {
      renderThanks(readRememberedSubmittedReview(requestId) || { id: reviewRequest.latestReviewId || '', shortReview: '' });
      return;
    }
    renderForm(reviewRequest);
  } catch (e) {
    renderError(e && e.message ? e.message : String(e));
  }
});
