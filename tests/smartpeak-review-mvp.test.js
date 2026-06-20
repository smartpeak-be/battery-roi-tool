import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('SmartPeak review MVP', () => {
  it('adds a public review page with editable display name and Google copy flow', () => {
    const html = read('review.html');
    const js = read('assets/js/pages/review-app.js');
    const css = read('assets/css/smartpeak.css');

    expect(html).toContain('assets/js/pages/review-app.js');
    expect(js).toContain('getReviewRequest(requestId)');
    expect(js).toContain('id="displayName"');
    expect(js).toContain('name="nameVisibility"');
    expect(js).toContain('Hoe mogen we je review tonen?');
    expect(js).toContain('Je kan je review met je naam laten tonen, of liever anoniem als “SmartPeak klant”.');
    expect(js).toContain('Met mijn naam');
    expect(js).toContain('Anoniem');
    expect(js).toContain("? 'SmartPeak klant'");
    expect(js).toContain('Tekst kopiëren');
    expect(js).toContain('Google review openen');
    expect(js).toContain('placeholder="${escapeHtml(googleText)}" required></textarea>');
    expect(js).toContain('Vertel kort hoe je de samenwerking met SmartPeak hebt ervaren.');
    expect(js).toContain('de installatie, de communicatie en wat je anderen zou meegeven');
    expect(js).not.toContain('We zijn tevreden over de samenwerking met SmartPeak');
    expect(js).not.toContain('Hoe mogen we je naam tonen op de website?');
    expect(js).not.toContain('required>${escapeHtml(googleText)}</textarea>');
    expect(js).toContain('Transparantie is belangrijk voor ons.');
    expect(js).toContain('via telefoon of mail');
    expect(js).toContain('Waarvoor geef je ons welke score?');
    expect(js).toContain("extraRatingHtml('ratingCommunication', 'Communicatie')");
    expect(js).toContain("extraRatingHtml('ratingPlanning', 'Planning en afspraken')");
    expect(js).toContain("extraRatingHtml('ratingInstallation', 'Installatie')");
    expect(js).toContain("extraRatingHtml('ratingFinish', 'Afwerking en netheid')");
    expect(js).not.toContain('Deze tekst tonen we straks ook met een kopieerknop voor Google.');
    expect(js).toContain('Reviews die we op onze website tonen, publiceren we pas na goedkeuring');
    expect(js).toContain('sp-review-section');
    expect(js).toContain('sp-review-choice');
    expect(css).toContain('.sp-review-card');
    expect(css).toContain('.sp-review-choice:hover');
  });

  it('keeps original project/customer names separate from public display name', () => {
    const firebase = read('assets/js/firebase-init.js');
    const js = read('assets/js/pages/review-app.js');

    expect(firebase).toContain('originalProjectName: project.projectName ||');
    expect(firebase).toContain('originalCustomerName: project.customerName ||');
    expect(firebase).toContain('suggestedDisplayName: project.customerName || project.projectName ||');
    expect(js).toContain('originalProjectName: reviewRequest.originalProjectName ||');
    expect(js).toContain("const publicDisplayName = nameVisibility === 'anonymous'");
    expect(js).toContain(": String(data.get('displayName') || '').trim()");
    expect(js).toContain('displayName: publicDisplayName');
    expect(js).toContain("ratingCommunication: readRating('ratingCommunication')");
    expect(firebase).toContain('ratingCommunication: Number(data.ratingCommunication) || 0');
  });

  it('adds dashboard review link generation and an embeddable carousel widget', () => {
    const dashboard = read('assets/js/pages/dashboard-app.js');
    const dashboardHtml = read('dashboard.html');
    const embedPage = read('reviews-embed.html');
    const widgetOnlyPage = read('reviews-widget.html');
    const widget = read('assets/js/widgets/reviews.js');
    const rules = read('firestore.rules');

    expect(dashboard).toContain('reviewLinkBtn');
    expect(dashboard).toContain('createAndCopyReviewLink');
    expect(dashboard).toContain('createReviewRequestForProject(projectId)');
    expect(dashboardHtml).toContain('reviews-beheer.html');
    expect(embedPage).toContain('data-limit="10"');
    expect(embedPage).toContain('SmartPeak reviews embed');
    expect(embedPage).toContain('configuratie- en testpagina');
    expect(embedPage).toContain('reviews-widget.html');
    expect(widgetOnlyPage).toContain('<div id="smartpeak-reviews"></div>');
    expect(widgetOnlyPage).toContain('assets/js/widgets/reviews.js');
    expect(widget).toContain("collectionId: 'reviews'");
    expect(widget).toContain("stringValue: 'published'");
    expect(widget).toContain('sp-review-widget__track');
    expect(widget).toContain('data-sp-review-next');
    expect(rules).toContain('match /reviewRequests/{requestId}');
    expect(rules).toContain('allow list:   if isSignedIn();');
    expect(rules).toContain('allow create: if isSignedIn() && isValidReviewRequestCreate();');
    expect(rules).toContain('data.createdBy == signedInEmail()');
    expect(rules).toContain('match /reviews/{reviewId}');
    expect(rules).toContain("'ratingCommunication'");
    expect(rules).toContain('data.ratingCommunication is number');
    expect(rules).toContain('isPublishedWebsiteReview');
  });
});
