// Storage migration: smartpeak-roi.firebasestorage.app → smartpeak-projects.firebasestorage.app.
//
// Streams every blob through Node (download → upload), preserving:
//   - object name (= path, so projects/{id}/{ts}_x.jpg stays identical)
//   - contentType
//   - metadata (custom + standard cacheControl/contentDisposition/etc.)
//
// Requires:
//   scripts/sa-source.json
//   scripts/sa-dest.json
//   Destination bucket must already exist (Firebase Console → Storage → Get started).
//
// Usage:
//   node scripts/migrate-storage.cjs                # do the migration
//   DRY_RUN=1 node scripts/migrate-storage.cjs      # just list source objects
//   CONCURRENCY=8 node scripts/migrate-storage.cjs  # tune parallel uploads (default 4)

const path   = require('path');
const fs     = require('fs');
const admin  = require('firebase-admin');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

const SOURCE_KEY_PATH = path.join(__dirname, 'sa-source.json');
const DEST_KEY_PATH   = path.join(__dirname, 'sa-dest.json');

const SOURCE_BUCKET = 'smartpeak-roi.firebasestorage.app';
const DEST_BUCKET   = 'smartpeak-projects.firebasestorage.app';

const DRY_RUN     = process.env.DRY_RUN === '1';
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10));

function loadKey(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`❌ Missing ${label} at ${p}.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const sourceKey = loadKey(SOURCE_KEY_PATH, 'source service account');
const destKey   = loadKey(DEST_KEY_PATH,   'destination service account');

const srcApp = admin.initializeApp({
  credential:    admin.credential.cert(sourceKey),
  storageBucket: SOURCE_BUCKET,
  projectId:     sourceKey.project_id,
}, 'src-storage');

const dstApp = admin.initializeApp({
  credential:    admin.credential.cert(destKey),
  storageBucket: DEST_BUCKET,
  projectId:     destKey.project_id,
}, 'dst-storage');

const srcBucket = srcApp.storage().bucket();
const dstBucket = dstApp.storage().bucket();

async function copyOne(file) {
  const dstFile = dstBucket.file(file.name);
  const meta = file.metadata || {};

  await pipeline(
    file.createReadStream(),
    dstFile.createWriteStream({
      resumable: false,
      metadata: {
        contentType:        meta.contentType,
        cacheControl:       meta.cacheControl,
        contentDisposition: meta.contentDisposition,
        contentEncoding:    meta.contentEncoding,
        contentLanguage:    meta.contentLanguage,
        metadata:           meta.metadata, // custom metadata
      },
    })
  );
}

async function pool(items, worker, concurrency) {
  let i = 0, done = 0;
  const total = items.length;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx]);
        done++;
        if (done % 25 === 0 || done === total) {
          process.stdout.write(`\r  ↳ ${done}/${total} files copied`);
        }
      } catch (e) {
        console.error(`\n✗ failed on ${items[idx].name}: ${e.message}`);
      }
    }
  });
  await Promise.all(runners);
  process.stdout.write('\n');
}

(async () => {
  console.log(`🚀 Storage migration: ${SOURCE_BUCKET} → ${DEST_BUCKET}`);
  console.log(`   DRY_RUN=${DRY_RUN}  CONCURRENCY=${CONCURRENCY}`);

  // Pre-flight: destination bucket must exist.
  const [destExists] = await dstBucket.exists();
  if (!destExists) {
    console.error(`❌ Destination bucket "${DEST_BUCKET}" does not exist.`);
    console.error('   Create it via Firebase Console → Build → Storage → Get started (kies europe-west).');
    process.exit(1);
  }

  console.log('Listing source bucket...');
  const [files] = await srcBucket.getFiles();
  console.log(`Found ${files.length} files.`);

  // Group counts per top-level prefix for visibility.
  const byPrefix = {};
  for (const f of files) {
    const prefix = f.name.split('/')[0] || '(root)';
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }
  for (const [k, v] of Object.entries(byPrefix).sort()) {
    console.log(`   ${k.padEnd(20)} ${v}`);
  }

  if (DRY_RUN) {
    console.log('DRY RUN — not copying.');
    return;
  }

  await pool(files, copyOne, CONCURRENCY);
  console.log('✅ Storage migration done.');
})().catch((e) => {
  console.error('Storage migration failed:', e);
  process.exit(1);
});
