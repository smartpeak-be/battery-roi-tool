const MAX_REVIEW_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_REVIEW_PHOTOS = 8;
const MAX_PATH_LENGTH = 1024;

function cleanString(value, maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requestScopedPath(value, requestId) {
  const path = cleanString(value, MAX_PATH_LENGTH);
  const id = cleanString(requestId, 160);
  if (!path || !id) return '';
  const prefix = `review-uploads/${id}/`;
  return path.startsWith(prefix) && path.length > prefix.length ? path : '';
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rating(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? number : 0;
}

function publicSolutionSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const result = {
    publicLabel: cleanString(summary.publicLabel, 240),
    inverterPowerW: positiveNumber(summary.inverterPowerW),
    storageKwh: positiveNumber(summary.storageKwh),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== '' && value !== null));
}

export function buildPublicReviewProjection(review, publication = {}) {
  const photosPublic = review?.reviewPhotosPublic === true;
  return {
    displayName: cleanString(review?.displayName, 160) || 'SmartPeak klant',
    rating: rating(review?.rating),
    ratingCommunication: rating(review?.ratingCommunication),
    ratingPlanning: rating(review?.ratingPlanning),
    ratingInstallation: rating(review?.ratingInstallation),
    ratingFinish: rating(review?.ratingFinish),
    shortReview: cleanString(review?.shortReview, 1200),
    solutionSummary: publicSolutionSummary(review?.solutionSummary),
    consentSocials: review?.consentSocials === true,
    reviewPhotosPublic: photosPublic,
    reviewPhotos: photosPublic && Array.isArray(publication.reviewPhotos) ? publication.reviewPhotos : [],
    publishedLabel: cleanString(publication.publishedLabel, 160),
    createdAt: review?.createdAt || null,
    publishedAt: publication.publishedAt || null,
  };
}

export function sanitizeReviewPhotoForPublication(photo, requestId) {
  if (!photo || typeof photo !== 'object' || Array.isArray(photo)) return null;
  const storagePath = requestScopedPath(photo.storagePath, requestId);
  const thumbStoragePath = requestScopedPath(photo.thumbStoragePath, requestId);
  const contentType = cleanString(photo.contentType, 120);
  const sizeBytes = positiveNumber(photo.sizeBytes);
  if (!storagePath || !thumbStoragePath) return null;
  if (!contentType.startsWith('image/')) return null;
  if (!sizeBytes || sizeBytes > MAX_REVIEW_PHOTO_BYTES) return null;

  return {
    storagePath,
    thumbStoragePath,
    downloadUrl: null,
    thumbUrl: null,
    name: cleanString(photo.name, 160) || 'review-photo',
    contentType,
    sizeBytes,
    width: positiveNumber(photo.width),
    height: positiveNumber(photo.height),
    tag: 'review',
  };
}

export async function hydrateReviewPhotosForPublication(photos, requestId, getDownloadUrl) {
  if (typeof getDownloadUrl !== 'function') throw new Error('Download-URL resolver ontbreekt');
  const safePhotos = (Array.isArray(photos) ? photos : [])
    .slice(0, MAX_REVIEW_PHOTOS)
    .map(photo => sanitizeReviewPhotoForPublication(photo, requestId))
    .filter(Boolean);

  const hydrated = await Promise.all(safePhotos.map(async photo => {
    try {
      const [downloadUrl, thumbUrl] = await Promise.all([
        getDownloadUrl(photo.storagePath),
        getDownloadUrl(photo.thumbStoragePath),
      ]);
      if (!downloadUrl || !thumbUrl) return null;
      return { ...photo, downloadUrl, thumbUrl };
    } catch {
      return null;
    }
  }));

  return hydrated.filter(Boolean);
}
