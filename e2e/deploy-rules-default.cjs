/**
 * Deploy firestore.rules to BOTH the default and named database releases.
 * The Firebase CLI v15 silently skips named databases, and the compat SDK
 * appears to evaluate rules from the default release even when connecting
 * to a named database. Belt-and-suspenders: update both.
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
  const rulesSource = fs.readFileSync(__dirname + '/../firestore.rules', 'utf8');
  console.log('Local rules loaded (' + rulesSource.length + ' bytes)');

  // Create new ruleset
  const newRuleset = await apiCall('POST', 'projects/smartpeak-roi/rulesets', {
    source: { files: [{ name: 'firestore.rules', content: rulesSource }] }
  });
  if (newRuleset.error) {
    console.error('Failed to create ruleset:', JSON.stringify(newRuleset.error));
    return;
  }
  console.log('Created ruleset:', newRuleset.name);

  // Update BOTH releases
  const releases = [
    'projects/smartpeak-roi/releases/cloud.firestore',
    'projects/smartpeak-roi/releases/cloud.firestore/smartpeak-battery-roi-be'
  ];

  for (const releaseName of releases) {
    const result = await apiCall('PATCH', releaseName, {
      release: { name: releaseName, rulesetName: newRuleset.name }
    });
    if (result.error) {
      console.error('Failed to update ' + releaseName + ':', JSON.stringify(result.error));
    } else {
      console.log('Updated:', result.name, '->', result.rulesetName);
    }
  }

  // Verify both
  for (const releaseName of releases) {
    const rel = await apiCall('GET', releaseName);
    const rs = await apiCall('GET', rel.rulesetName);
    const content = rs.source.files[0].content;
    const hasLeadsUpdate = content.includes('allow update: if isWhitelisted()') && content.includes('match /leads/');
    console.log(releaseName, '-> leads update rule:', hasLeadsUpdate ? 'PRESENT' : 'MISSING');
  }

  console.log('\nDeploy complete.');
}

main().catch(console.error);
