import { describe, expect, it, vi } from 'vitest';
import {
  buildPublicReviewProjection,
  hydrateReviewPhotosForPublication,
  sanitizeReviewPhotoForPublication,
} from '../assets/js/review-photo-publication.js';

const requestId = 'review-request-123';
const prefix = `review-uploads/${requestId}/`;

function validPhoto(name = 'installation.jpg') {
  return {
    storagePath: `${prefix}${name}`,
    thumbStoragePath: `${prefix}${name.replace(/\.jpg$/, '')}_thumb.jpg`,
    downloadUrl: 'https://attacker.invalid/full',
    thumbUrl: 'https://attacker.invalid/thumb',
    name,
    contentType: 'image/jpeg',
    sizeBytes: 24_073,
    width: 1200,
    height: 800,
    tag: 'review',
  };
}

describe('review photo publication', () => {
  it('accepts request-scoped image paths and strips client-supplied URLs', () => {
    const safe = sanitizeReviewPhotoForPublication(validPhoto(), requestId);

    expect(safe).toMatchObject({
      storagePath: `${prefix}installation.jpg`,
      thumbStoragePath: `${prefix}installation_thumb.jpg`,
      downloadUrl: null,
      thumbUrl: null,
      contentType: 'image/jpeg',
      sizeBytes: 24_073,
      tag: 'review',
    });
  });

  it('rejects paths outside the originating review request', () => {
    expect(sanitizeReviewPhotoForPublication({
      ...validPhoto(),
      storagePath: 'projects/private-project/offer.pdf',
    }, requestId)).toBeNull();

    expect(sanitizeReviewPhotoForPublication({
      ...validPhoto(),
      thumbStoragePath: 'review-uploads/another-request/thumb.jpg',
    }, requestId)).toBeNull();
  });

  it('rejects malformed, non-image, oversized, and incomplete photo entries', () => {
    expect(sanitizeReviewPhotoForPublication(null, requestId)).toBeNull();
    expect(sanitizeReviewPhotoForPublication({ ...validPhoto(), contentType: 'application/pdf' }, requestId)).toBeNull();
    expect(sanitizeReviewPhotoForPublication({ ...validPhoto(), sizeBytes: 15 * 1024 * 1024 + 1 }, requestId)).toBeNull();
    expect(sanitizeReviewPhotoForPublication({ ...validPhoto(), thumbStoragePath: '' }, requestId)).toBeNull();
  });

  it('regenerates both token URLs from validated paths', async () => {
    const getDownloadUrl = vi.fn(async path => `https://storage.example/${encodeURIComponent(path)}?token=fresh`);

    const [photo] = await hydrateReviewPhotosForPublication([validPhoto()], requestId, getDownloadUrl);

    expect(getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(getDownloadUrl).toHaveBeenNthCalledWith(1, `${prefix}installation.jpg`);
    expect(getDownloadUrl).toHaveBeenNthCalledWith(2, `${prefix}installation_thumb.jpg`);
    expect(photo.downloadUrl).toContain('token=fresh');
    expect(photo.thumbUrl).toContain('token=fresh');
    expect(photo.downloadUrl).not.toContain('attacker.invalid');
  });

  it('drops invalid or unreadable photos without blocking valid photos', async () => {
    const good = validPhoto('good.jpg');
    const missing = validPhoto('missing.jpg');
    const hostile = { ...validPhoto('hostile.jpg'), storagePath: 'projects/private/photo.jpg' };
    const getDownloadUrl = vi.fn(async path => {
      if (path.includes('missing')) throw new Error('object-not-found');
      return `https://storage.example/${encodeURIComponent(path)}?token=fresh`;
    });

    const hydrated = await hydrateReviewPhotosForPublication([good, missing, hostile], requestId, getDownloadUrl);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].name).toBe('good.jpg');
  });

  it('builds an allowlisted public projection without private or identifying fields', () => {
    const source = {
      requestId: 'secret-request',
      projectId: 'secret-project',
      originalCustomerName: 'Private Customer',
      originalProjectName: 'Private Address',
      privateFeedback: 'Keep this private',
      googleReviewUrl: 'https://private.example',
      displayName: 'Anonieme klant',
      rating: 5,
      ratingCommunication: 4,
      ratingPlanning: 3,
      ratingInstallation: 5,
      ratingFinish: 4,
      shortReview: 'Prima installatie.',
      solutionSummary: {
        publicLabel: 'Thuisbatterij 10 kWh',
        inverterPowerW: 3000,
        storageKwh: 10,
        internalPrice: 1234,
      },
      reviewPhotosPublic: false,
      reviewPhotos: [{ downloadUrl: 'https://attacker.example/token' }],
      createdAt: 'created',
    };

    const projection = buildPublicReviewProjection(source, {
      publishedLabel: 'Geverifieerde SmartPeak klant',
      publishedAt: 'published',
      reviewPhotos: [{ downloadUrl: 'https://safe.example/photo' }],
    });

    expect(projection).toEqual({
      displayName: 'Anonieme klant',
      rating: 5,
      ratingCommunication: 4,
      ratingPlanning: 3,
      ratingInstallation: 5,
      ratingFinish: 4,
      shortReview: 'Prima installatie.',
      solutionSummary: {
        publicLabel: 'Thuisbatterij 10 kWh',
        inverterPowerW: 3000,
        storageKwh: 10,
      },
      reviewPhotosPublic: false,
      reviewPhotos: [],
      publishedLabel: 'Geverifieerde SmartPeak klant',
      createdAt: 'created',
      publishedAt: 'published',
    });
    expect(JSON.stringify(projection)).not.toContain('private');
    expect(JSON.stringify(projection)).not.toContain('secret');
    expect(JSON.stringify(projection)).not.toContain('attacker');
    expect(JSON.stringify(projection)).not.toContain('internalPrice');
  });
});
