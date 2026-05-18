// Wipe ALL Firestore data in smartpeak-projects/(default).
// Used to clean up an incomplete prior migration before re-running with the correct source.
//
// Requires: scripts/sa-dest.json
// Usage:    node scripts/wipe-dest-firestore.cjs

const admin = require('firebase-admin');
const path  = require('path');

const sa = require(path.join(__dirname, 'sa-dest.json'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'smartpeak-projects' });
const db = admin.firestore();

async function deleteCollection(collRef) {
  let total = 0;
  // Drain subcollections first, then the docs themselves.
  const snap = await collRef.get();
  for (const docSnap of snap.docs) {
    const subs = await docSnap.ref.listCollections();
    for (const sub of subs) {
      total += await deleteCollection(sub);
    }
  }
  // Now delete docs in batches of 500 (Firestore batch cap).
  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = db.batch();
    snap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  total += snap.size;
  console.log(`  cleared ${collRef.path}: ${snap.size}`);
  return total;
}

(async () => {
  console.log('🧨 Wiping smartpeak-projects (default) Firestore...');
  const cols = await db.listCollections();
  let grand = 0;
  for (const c of cols) {
    grand += await deleteCollection(c);
  }
  console.log(`Done. ${grand} docs removed across ${cols.length} top-level collections.`);
})().catch(e => { console.error(e); process.exit(1); });
