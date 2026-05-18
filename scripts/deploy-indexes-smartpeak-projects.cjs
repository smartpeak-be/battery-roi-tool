// Deploy firestore.indexes.json to smartpeak-projects (default DB) via the
// firestore.googleapis.com Admin API.
//
// We POST each index individually to v1/.../collectionGroups/{coll}/indexes.
// Idempotent: if an identical index already exists, the API returns 409 and we skip.
//
// Requires: scripts/sa-dest.json
// Usage:    node scripts/deploy-indexes-smartpeak-projects.cjs

const admin = require('firebase-admin');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PROJECT_ID = 'smartpeak-projects';
const DATABASE   = '(default)';

const sa = JSON.parse(fs.readFileSync(path.join(__dirname, 'sa-dest.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT_ID });

function apiCall(method, urlPath, body) {
  return admin.app().options.credential.getAccessToken().then((t) => new Promise((res, rej) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path:     urlPath,
      method,
      headers: { 'Authorization': 'Bearer ' + t.access_token, 'Content-Type': 'application/json' },
    }, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res({ code: r.statusCode, body: JSON.parse(d) }); } catch { res({ code: r.statusCode, body: d }); } });
    });
    req.on('error', rej);
    if (body) req.write(JSON.stringify(body));
    req.end();
  }));
}

(async () => {
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
  console.log(`📦 ${indexes.indexes.length} index(es) to deploy on ${PROJECT_ID}/${DATABASE}`);

  for (const idx of indexes.indexes) {
    const fields = idx.fields.map(f => ({ fieldPath: f.fieldPath, order: f.order || 'ASCENDING' }));
    const body = { queryScope: idx.queryScope || 'COLLECTION', fields };
    const url = `/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/${idx.collectionGroup}/indexes`;
    const res = await apiCall('POST', url, body);
    if (res.code === 200 || res.code === 201) {
      console.log(`✅ ${idx.collectionGroup}: created (operation ${res.body.name})`);
    } else if (res.code === 409 || (res.body && res.body.error && /already exists/i.test(res.body.error.message || ''))) {
      console.log(`⏭  ${idx.collectionGroup}: already exists`);
    } else {
      console.error(`❌ ${idx.collectionGroup}: ${res.code} ${JSON.stringify(res.body)}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
