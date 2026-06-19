import { escapeHtml, showToast, withSpinner } from '../shared-helpers.js';

const FALLBACK_GOOGLE_REVIEW_URL = 'https://www.google.com/search?q=SmartPeak+review';
const container = document.getElementById('reviewContainer');

let requestId = '';
let reviewRequest = null;

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

function starInputHtml() {
  return `
    <div class="sp-star-rating" role="radiogroup" aria-label="Score">
      ${[5, 4, 3, 2, 1].map(value => `
        <input type="radio" id="rating-${value}" name="rating" value="${value}" ${value === 5 ? 'checked' : ''}>
        <label for="rating-${value}" title="${value} op 5"><i class="fa-solid fa-star"></i></label>
      `).join('')}
    </div>`;
}

function displayNameFromRequest(req) {
  return req.suggestedDisplayName || req.originalCustomerName || req.originalProjectName || '';
}

function googleTextFallback(req) {
  const name = req.originalProjectName || req.originalCustomerName || 'onze installatie';
  return `We zijn tevreden over de samenwerking met SmartPeak voor ${name}. De installatie is vlot verlopen en de communicatie was duidelijk.`;
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

    <form id="reviewForm" class="card shadow-sm border-0 mt-3">
      <div class="card-body p-4 p-md-5">
        <input type="hidden" name="requestId" value="${escapeHtml(requestId)}">

        <div class="mb-4">
          <label for="displayName" class="form-label fw-semibold">Naam die bij de review mag staan</label>
          <input id="displayName" name="displayName" class="form-control form-control-lg" maxlength="120" value="${escapeHtml(displayName)}" autocomplete="name">
          <div class="form-text">Dit wijzigt enkel de reviewnaam, niet onze projectgegevens.</div>
        </div>

        <fieldset class="mb-4">
          <legend class="form-label fw-semibold mb-2">Hoe mogen we je naam tonen op de website?</legend>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="nameVisibility" id="nameVisibilityFull" value="full" checked>
            <label class="form-check-label" for="nameVisibilityFull">Mijn volledige naam mag bij de review staan.</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="nameVisibility" id="nameVisibilityAnonymous" value="anonymous">
            <label class="form-check-label" for="nameVisibilityAnonymous">Toon mijn review liever anoniem als "SmartPeak klant".</label>
          </div>
        </fieldset>

        <div class="mb-4">
          <label class="form-label fw-semibold d-block">Algemene score</label>
          ${starInputHtml()}
        </div>

        <div class="mb-4">
          <label for="shortReview" class="form-label fw-semibold">Als je dit kort zou samenvatten, wat mag er dan als review staan?</label>
          <textarea id="shortReview" name="shortReview" class="form-control" rows="4" maxlength="1200" required>${escapeHtml(googleText)}</textarea>
          <div class="form-text">Deze tekst tonen we straks ook met een kopieerknop voor Google. Het is gewoon een voorbeeldtekst: pas gerust aan of schrijf iets volledig in je eigen woorden.</div>
        </div>

        <div class="mb-4">
          <label for="privateFeedback" class="form-label fw-semibold">Extra feedback voor ons <span class="text-muted fw-normal">(optioneel)</span></label>
          <textarea id="privateFeedback" name="privateFeedback" class="form-control" rows="3" maxlength="2000" placeholder="Wat liep goed? Wat kan beter?"></textarea>
          <div class="form-text">Dit is enkel voor ons en komt niet publiek bij je review.</div>
        </div>

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
      displayNameInput.closest('.mb-4')?.classList.toggle('opacity-50', anonymous);
    }
  });
  form.addEventListener('submit', submitForm);
}

function renderThanks(review) {
  const text = review.shortReview || '';
  container.innerHTML = `
    <section class="card shadow-sm border-0">
      <div class="card-body p-4 p-md-5 text-center">
        <div class="display-5 text-success mb-3"><i class="fa-solid fa-circle-check"></i></div>
        <h1 class="h3 fw-bold mb-3">Merci voor je feedback!</h1>
        <p class="text-muted mb-4">Wil je ons nog extra helpen? Plaats dezelfde tekst dan ook als Google review.</p>
        <div class="sp-google-copy text-start mb-3">${escapeHtml(text)}</div>
        <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
          <button class="btn btn-outline-primary btn-lg" id="copyReviewBtn" type="button"><i class="fa-solid fa-copy me-1"></i> Tekst kopiëren</button>
          <a class="btn btn-primary btn-lg" id="googleReviewBtn" href="${escapeHtml(review.googleReviewUrl || FALLBACK_GOOGLE_REVIEW_URL)}" target="_blank" rel="noopener"><i class="fa-brands fa-google me-1"></i> Google review openen</a>
        </div>
      </div>
    </section>`;
  document.getElementById('copyReviewBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Reviewtekst gekopieerd.', 'success');
    } catch {
      showToast('Kopiëren mislukt. Selecteer de tekst manueel.', 'warning');
    }
  });
  document.getElementById('googleReviewBtn').addEventListener('click', () => markReviewGoogleClicked(review.id));
}

async function markReviewGoogleClicked(reviewId) {
  if (!reviewId || typeof updateReviewGoogleClicked !== 'function') return;
  try { await updateReviewGoogleClicked(reviewId); } catch (e) { console.warn('Google-click niet opgeslagen', e); }
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const rating = Number(data.get('rating')) || 0;
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
    shortReview: String(data.get('shortReview') || '').trim(),
    privateFeedback: String(data.get('privateFeedback') || '').trim(),
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

  await withSpinner(async () => {
    try {
      const reviewId = await submitSmartPeakReview(payload);
      renderThanks({ id: reviewId, ...payload });
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
    renderForm(reviewRequest);
  } catch (e) {
    renderError(e && e.message ? e.message : String(e));
  }
});
