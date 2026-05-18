// Configure CORS on the smartpeak-projects Storage bucket so that browser-side
// resumable uploads (Firebase Storage SDK for files >5MB) can post to
// storage.googleapis.com from any origin.
//
// Without this, files larger than ~5MB silently stall at 0% because Chrome
// blocks the cross-origin POST when storage.googleapis.com has no CORS config.
// New Firebase Storage buckets default to NO CORS config — this script fixes
// that. Run once after creating a bucket.
//
// Requires: scripts/sa-dest.json
// Usage:    node scripts/set-storage-cors.cjs

const admin = require('firebase-admin');
const path  = require('path');

const sa = require(path.join(__dirname, 'sa-dest.json'));
admin.initializeApp({
  credential:    admin.credential.cert(sa),
  storageBucket: 'smartpeak-projects.firebasestorage.app',
  projectId:     'smartpeak-projects',
});

(async () => {
  const bucket = admin.storage().bucket();
  await bucket.setCorsConfiguration([{
    origin:         ['*'],
    method:         ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    responseHeader: [
      'Content-Type', 'Content-Range', 'Content-Disposition',
      // Headers used by the resumable-upload protocol.
      'x-goog-resumable', 'x-goog-upload-command', 'x-goog-upload-offset',
      'x-goog-upload-status', 'x-goog-upload-url', 'x-goog-upload-protocol',
      'x-goog-upload-chunk-granularity',
      'Authorization', 'User-Agent',
    ],
    maxAgeSeconds: 3600,
  }]);
  const [meta] = await bucket.getMetadata();
  console.log('✅ CORS applied:');
  console.log(JSON.stringify(meta.cors, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
