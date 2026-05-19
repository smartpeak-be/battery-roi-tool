/**
 * Deploy storage.rules to Firebase Storage via the REST API.
 * The firebase.json only configures Firestore, so `firebase deploy --only storage`
 * does not work. This script deploys storage rules directly.
 *
 * Usage: node e2e/deploy-storage-rules.cjs
 * Requires: e2e/service-account-key.json
 */
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');

const sa = JSON.parse(fs.readFileSync(__dirname + '/service-account-key.json', 'utf8'));
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'smartpeak-roi' });
}

function apiCall(method, path, body) {
  return admin.app().options.credential.getAccessToken().then(tokenObj => {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'firebaserules.googleapis.com',
        path: '/v1/' + path,
        method: method,
        headers: {
          'Authorization': 'Bearer ' + tokenObj.access_token,
          'Content-Type': 'application/json'
        }
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

async function main() {
  const rulesSource = fs.readFileSync(__dirname + '/../storage.rules', 'utf8');
  console.log('Local storage rules loaded (' + rulesSource.length + ' bytes)');

  // Create new ruleset for storage
  const newRuleset = await apiCall('POST', 'projects/smartpeak-roi/rulesets', {
    source: { files: [{ name: 'storage.rules', content: rulesSource }] }
  });
  if (newRuleset.error) {
    console.error('Failed to create ruleset:', JSON.stringify(newRuleset.error));
    return;
  }
  console.log('Created ruleset:', newRuleset.name);

  // Update the Firebase Storage release
  // Note: bucket name uses project_id (smartpeak-roi), not the .app domain variant
  const releaseName = 'projects/smartpeak-roi/releases/firebase.storage/smartpeak-roi.firebasestorage.app';
  const result = await apiCall('PATCH', releaseName, {
    release: { name: releaseName, rulesetName: newRuleset.name }
  });
  if (result.error) {
    // If the release doesn't exist yet, try creating it
    if (result.error.code === 404) {
      console.log('Release not found, trying to create...');
      const createResult = await apiCall('POST', 'projects/smartpeak-roi/releases', {
        name: releaseName,
        rulesetName: newRuleset.name
      });
      if (createResult.error) {
        console.error('Failed to create release:', JSON.stringify(createResult.error));
        return;
      }
      console.log('Created release:', createResult.name, '->', createResult.rulesetName);
    } else {
      console.error('Failed to update release:', JSON.stringify(result.error));
      return;
    }
  } else {
    console.log('Updated:', result.name, '->', result.rulesetName);
  }

  // Verify
  const rel = await apiCall('GET', releaseName);
  if (rel.rulesetName) {
    const rs = await apiCall('GET', rel.rulesetName);
    const content = rs.source?.files?.[0]?.content || '';
    const hasProducts = content.includes('match /products/{productId}');
    console.log('Verification - products rule:', hasProducts ? 'PRESENT' : 'MISSING');
  }

  console.log('\nStorage rules deploy complete.');
}

main().catch(console.error);
