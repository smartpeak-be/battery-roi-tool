import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('SmartPeak review moderation', () => {
  it('adds a login-gated moderation page for approving and publishing reviews', () => {
    const html = read('reviews-beheer.html');
    const js = read('assets/js/pages/reviews-beheer-app.js');

    expect(html).toContain('Review moderatie');
    expect(html).toContain('reviews-embed.html');
    expect(html).toContain('reviews-widget.html');
    expect(html).toContain('assets/js/pages/reviews-beheer-app.js');
    expect(js).toContain('listSmartPeakReviews(100)');
    expect(js).toContain('withSpinner(action, { message: spinnerMessage })');
    expect(js).not.toContain('withSpinner(btn, async');
    expect(js).toContain('btn.innerHTML');
    expect(js).toContain('updateSmartPeakReviewStatus(reviewId, status, extra)');
    expect(js).toContain("publishedLabel = 'Geverifieerde SmartPeak klant'");
    expect(js).toContain('data-review-action="publish"');
    expect(js).toContain('Geen website-toestemming');
    expect(js).toContain('reviewRatingsHtml(review)');
    expect(js).toContain('Afwerking en netheid');
    expect(js).toContain('data-review-action="delete"');
    expect(js).toContain('Review definitief verwijderen?');
    expect(js).toContain('deleteSmartPeakReview(reviewId)');
    expect(js).toContain("showToast('Review verwijderd.', 'success')");
  });

  it('styles the embed page and moderation cards in the SmartPeak brand layer', () => {
    const css = read('assets/css/smartpeak.css');

    expect(css).toContain('.sp-public-reviews-page');
    expect(css).toContain('.sp-public-reviews-card');
    expect(css).toContain('.sp-review-moderation-card');
    expect(css).toContain('.sp-review-moderation-actions');
  });
});
