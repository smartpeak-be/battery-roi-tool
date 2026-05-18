// Deploy firestore.rules + storage.rules to the smartpeak-projects Firebase project
// (default Firestore DB + default Storage bucket).
//
// Uses the Firebase Rules REST API directly (firebaserules.googleapis.com) so we
// don't depend on the Firebase CLI's project context. Storage rules go via the
// same API but their "release" is named after the bucket.
//
// Requires: scripts/sa-dest.json
//
// Usage: node scripts/deploy-rules-smartpeak-projects.cjs

const admin = require('firebase-admin');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DEST_KEY_PATH = path.join(__dirname, 'sa-dest.json');
const PROJECT_ID    = 'smartpeak-projects';
const STORAGE_BUCKET = 'smartpeak-projects.firebasestorage.app';

if (!fs.existsSync(DEST_KEY_PATH)) {
  console.error(`❌ Missing destination service account at ${DEST_KEY_PATH}`);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(DEST_KEY_PATH, 'utf8'));
if (sa.project_id !== PROJECT_ID) {
  console.error(`❌ sa-dest.json belongs to "${sa.project_id}" but expected "${PROJECT_ID}".`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT_ID });

function apiCall(method, urlPath, body) {
  return admin.app().options.credential.getAccessToken().then((tokenObj) => {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'firebaserules.googleapis.com',
        path:     '/v1/' + urlPath,
        method,
        headers: {
          'Authorization': 'Bearer ' + tokenObj.access_token,
          'Content-Type':  'application/json',
        },
      }, (res) => {
        let data = '';
        res.on('data', (d) => data += d);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

async function deployRules({ filename, localPath, releaseName }) {
  const source = fs.readFileSync(localPath, 'utf8');
  console.log(`📦 ${filename} loaded (${source.length} bytes)`);

  const ruleset = await apiCall('POST', `projects/${PROJECT_ID}/rulesets`, {
    source: { files: [{ name: filename, content: source }] },
  });
  if (ruleset.error) {
    console.error(`❌ create ruleset failed:`, JSON.stringify(ruleset.error));
    return false;
  }
  console.log(`   ruleset created: ${ruleset.name}`);

  // Try PATCH first (release exists). If that 404s, POST to create the release.
  let result = await apiCall('PATCH', releaseName, {
    release: { name: releaseName, rulesetName: ruleset.name },
  });
  if (result.error && result.error.code === 404) {
    console.log(`   release not found, creating: ${releaseName}`);
    result = await apiCall('POST', `projects/${PROJECT_ID}/releases`, {
      name:        releaseName,
      rulesetName: ruleset.name,
    });
  }
  if (result.error) {
    console.error(`❌ release update failed:`, JSON.stringify(result.error));
    return false;
  }
  console.log(`✅ ${releaseName} -> ${ruleset.name}`);
  return true;
}

(async () => {
  console.log(`🚀 Deploying rules to project "${PROJECT_ID}"`);

  await deployRules({
    filename:    'firestore.rules',
    localPath:   path.join(__dirname, '..', 'firestore.rules'),
    releaseName: `projects/${PROJECT_ID}/releases/cloud.firestore`,
  });

  await deployRules({
    filename:    'storage.rules',
    localPath:   path.join(__dirname, '..', 'storage.rules'),
    releaseName: `projects/${PROJECT_ID}/releases/firebase.storage/${STORAGE_BUCKET}`,
  });

  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
