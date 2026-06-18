import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('SmartPeak review MVP', () => {
  it('adds a public review page with editable display name and Google copy flow', () => {
    const html = read('review.html');
    const js = read('assets/js/pages/review-app.js');

    expect(html).toContain('assets/js/pages/review-app.js');
    expect(js).toContain('getReviewRequest(requestId)');
    expect(js).toContain('id="displayName"');
    expect(js).toContain('Dit wijzigt enkel de reviewnaam, niet onze projectgegevens.');
    expect(js).toContain('Tekst kopiëren');
    expect(js).toContain('Google review openen');
    expect(js).toContain('Transparantie is belangrijk voor ons.');
    expect(js).toContain('Reviews die we op onze website tonen, publiceren we pas na goedkeuring');
  });

  it('keeps original project/customer names separate from public display name', () => {
    const firebase = read('assets/js/firebase-init.js');
    const js = read('assets/js/pages/review-app.js');

    expect(firebase).toContain('originalProjectName: project.projectName ||');
    expect(firebase).toContain('originalCustomerName: project.customerName ||');
    expect(firebase).toContain('suggestedDisplayName: project.customerName || project.projectName ||');
    expect(js).toContain('originalProjectName: reviewRequest.originalProjectName ||');
    expect(js).toContain('displayName: String(data.get(\'displayName\') || \'\').trim()');
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
    expect(rules).toContain('isPublishedWebsiteReview');
  });
});
