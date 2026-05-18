// Firestore migration: smartpeak-roi (named DB "smartpeak-battery-roi-be") → smartpeak-projects (default DB).
//
// Strategy:
//   - Use Admin SDK with two service accounts (one per project).
//   - listCollections() to enumerate top-level + recursive sub-collections so nothing is missed.
//   - Preserve doc IDs 1-on-1 (.doc(id).set(data)) so all internal references (incl. share-link
//     payloads with embedded IDs, lead.projectId, etc.) keep working.
//   - Use BulkWriter for parallel writes with built-in retry/backoff.
//   - DRY_RUN env var: if set to "1", logs counts but writes nothing.
//
// Requires:
//   scripts/sa-source.json — service account for smartpeak-roi
//   scripts/sa-dest.json   — service account for smartpeak-projects
//
// Usage:
//   node scripts/migrate-firestore.cjs            # do the migration
//   DRY_RUN=1 node scripts/migrate-firestore.cjs  # just count
//
// Note: Timestamps and references are preserved by the Admin SDK as native types.
// DocumentReference fields would be re-anchored to the destination project, which is correct
// for cross-project migration (the ref's path is what matters).

const path = require('path');
const fs   = require('fs');
const admin = require('firebase-admin');

const SOURCE_KEY_PATH = path.join(__dirname, 'sa-source.json');
const DEST_KEY_PATH   = path.join(__dirname, 'sa-dest.json');

const SOURCE_PROJECT_ID = 'smartpeak-roi';
// Production data lives in the (default) DB on the source project; the named
// "smartpeak-battery-roi-be" DB held an older/test snapshot that we don't want.
const SOURCE_DATABASE   = '(default)';
const DEST_PROJECT_ID   = 'smartpeak-projects';

const DRY_RUN = process.env.DRY_RUN === '1';

function loadKey(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`❌ Missing ${label} at ${p}.`);
    console.error('   Generate it in Firebase Console → Project Settings → Service Accounts → Generate new private key.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const sourceKey = loadKey(SOURCE_KEY_PATH, 'source service account');
const destKey   = loadKey(DEST_KEY_PATH,   'destination service account');

if (sourceKey.project_id !== SOURCE_PROJECT_ID) {
  console.error(`❌ sa-source.json belongs to project "${sourceKey.project_id}" but expected "${SOURCE_PROJECT_ID}".`);
  process.exit(1);
}
if (destKey.project_id !== DEST_PROJECT_ID) {
  console.error(`❌ sa-dest.json belongs to project "${destKey.project_id}" but expected "${DEST_PROJECT_ID}".`);
  process.exit(1);
}

const srcApp = admin.initializeApp({
  credential: admin.credential.cert(sourceKey),
  projectId:  SOURCE_PROJECT_ID,
}, 'source');

const dstApp = admin.initializeApp({
  credential: admin.credential.cert(destKey),
  projectId:  DEST_PROJECT_ID,
}, 'dest');

const srcDb = srcApp.firestore();
const srcSettings = { ignoreUndefinedProperties: true };
if (SOURCE_DATABASE && SOURCE_DATABASE !== '(default)') srcSettings.databaseId = SOURCE_DATABASE;
srcDb.settings(srcSettings);
const dstDb = dstApp.firestore();
dstDb.settings({ ignoreUndefinedProperties: true });

const bulk = dstDb.bulkWriter();
bulk.onWriteError((err) => {
  // Retry up to 5 times on transient errors.
  if (err.failedAttempts < 5) return true;
  console.error(`✗ giving up on ${err.documentRef.path} after ${err.failedAttempts} attempts:`, err.message);
  return false;
});

const stats = {};
function bump(collPath) {
  stats[collPath] = (stats[collPath] || 0) + 1;
}

async function copyCollection(srcCollRef, dstCollRef) {
  const snap = await srcCollRef.get();
  for (const docSnap of snap.docs) {
    const dstDocRef = dstCollRef.doc(docSnap.id);
    if (!DRY_RUN) {
      bulk.set(dstDocRef, docSnap.data());
    }
    bump(srcCollRef.path);

    // Recurse into sub-collections of this doc.
    const subColls = await docSnap.ref.listCollections();
    for (const subColl of subColls) {
      await copyCollection(subColl, dstDocRef.collection(subColl.id));
    }
  }
}

(async () => {
  console.log(`🚀 Migration: ${SOURCE_PROJECT_ID}/${SOURCE_DATABASE} → ${DEST_PROJECT_ID}/(default)`);
  console.log(DRY_RUN ? '   (DRY RUN — nothing will be written)' : '   Writing now.');

  const topColls = await srcDb.listCollections();
  console.log(`Found ${topColls.length} top-level collections: ${topColls.map(c => c.id).join(', ')}`);

  for (const coll of topColls) {
    process.stdout.write(`  → ${coll.id} ... `);
    const before = Object.keys(stats).length;
    await copyCollection(coll, dstDb.collection(coll.id));
    process.stdout.write(`${stats[coll.id] || 0} docs\n`);
  }

  if (!DRY_RUN) {
    console.log('Flushing BulkWriter...');
    await bulk.close();
  }

  console.log('\n✅ Done. Per-collection counts:');
  for (const [k, v] of Object.entries(stats).sort()) {
    console.log(`   ${k.padEnd(60)} ${v}`);
  }
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log(`   ${''.padEnd(60, '-')}`);
  console.log(`   TOTAL${''.padEnd(55)} ${total}`);
})().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
