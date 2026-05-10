#!/usr/bin/env node
// scripts/reseed-specs.js
// Re-seeds specs for products whose specs were wiped (empty object) because
// they were saved through the UI while spec fields weren't rendering for
// thuisbatterij-systemen. Matches products by seedKey and only updates if
// specs is empty or missing.
//
// Run with: node scripts/reseed-specs.js

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const admin = require('firebase-admin');
const serviceAccount = require(join(__dirname, '..', 'e2e', 'service-account-key.json'));

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = app.firestore();

// Match by brand+model since seedKey may have been wiped by UI saves
const SEED_SPECS_BY_NAME = {
  'Zendure|Solarflow 2400 AC+': {
    capacityKwh: 2.4,
    inverterPowerKw: 2.4,
    peakPowerKw: 3.6,
    maxAcInputKw: 3.2,
    efficiency: 93,
    weightKg: 27.8,
    chemistry: 'LiFePO4',
    nominalVoltage: 48,
    cycleLife: 6000,
    maxChargePowerW: 2400,
    maxDischargePowerW: 2400,
    depthOfDischarge: 100,
    selfHeating: false,
    ipRating: 'IP65',
    operatingTempMin: -20,
    operatingTempMax: 55,
    connectivity: 'WiFi, Bluetooth',
    warrantyYears: 10,
    mountType: 'Muur',
    heightMm: 326,
    widthMm: 294,
    depthMm: 251,
  },
  'Zendure|AB3000L': {
    capacityKwh: 2.88,
    weightKg: 26.3,
    chemistry: 'LiFePO4',
    cycleLife: 6000,
    depthOfDischarge: 100,
    warrantyYears: 10,
  },
  'Marstek|Venus E V03': {
    capacityKwh: 5.12,
    inverterPowerKw: 2.5,
    efficiency: 90,
    weightKg: 60,
    chemistry: 'LiFePO4',
    cycleLife: 6000,
    depthOfDischarge: 100,
    warrantyYears: 10,
    heightMm: 680,
    widthMm: 450,
    depthMm: 200,
  },
};

async function main() {
  const snap = await db.collection('products').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const nameKey = `${data.brand}|${data.model}`;

    if (!SEED_SPECS_BY_NAME[nameKey]) {
      console.log(`  SKIP: ${data.brand} ${data.model} (no matching seed specs for key "${nameKey}")`);
      skipped++;
      continue;
    }

    const currentSpecs = data.specs;
    const isEmpty = !currentSpecs || Object.keys(currentSpecs).length === 0;

    if (!isEmpty) {
      console.log(`  SKIP: ${data.brand} ${data.model} (specs already populated: ${Object.keys(currentSpecs).length} keys)`);
      skipped++;
      continue;
    }

    const newSpecs = SEED_SPECS_BY_NAME[nameKey];
    await doc.ref.update({
      specs: newSpecs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  UPDATED: ${data.brand} ${data.model} (restored ${Object.keys(newSpecs).length} spec fields)`);
    updated++;
  }

  console.log(`\nDone: ${updated} products updated, ${skipped} skipped.`);
  await app.delete();
}

main().catch(err => {
  console.error('Reseed failed:', err);
  process.exit(1);
});
