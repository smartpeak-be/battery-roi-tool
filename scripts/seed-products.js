#!/usr/bin/env node
// scripts/seed-products.js
// One-time seed script to populate the products collection with current Google Sheet configs.
// Run with: node scripts/seed-products.js
// Requires: e2e/service-account-key.json

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const admin = require('firebase-admin');
const serviceAccount = require(join(__dirname, '..', 'e2e', 'service-account-key.json'));

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db = app.firestore();
db.settings({ databaseId: 'smartpeak-battery-roi-be' });

// ─── LOOK UP CATEGORY IDs ──────────────────────────────────────────────────

async function getOrCreateCategoryId(slug) {
  const snap = await db.collection('productCategories')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;

  // Category doesn't exist — create it (same defaults as producten-beheer.html)
  const defaults = {
    batterijen:  { name: 'Batterijen',  slug: 'batterijen',  isDefault: false, sortOrder: 0 },
    omvormers:   { name: 'Omvormers',   slug: 'omvormers',   isDefault: false, sortOrder: 1 },
    materiaal:   { name: 'Materiaal',   slug: 'materiaal',   isDefault: true,  sortOrder: 2 },
  };
  const catData = defaults[slug];
  if (!catData) throw new Error(`Unknown category slug "${slug}"`);

  console.log(`  Creating missing category: ${catData.name}`);
  const ref = await db.collection('productCategories').add({
    ...catData,
    specFields: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// ─── ZENDURE SOLARFLOW 2400 AC+ CONFIGS ─────────────────────────────────────
// From Google Sheet: ZSF2400AC+_NXM  (N hubs, M batteries per hub)
// Hub specs from spec page: 2.4 kWh built-in LiFePO4, 2.4 kW AC, 93% eff
// AB3000L specs: 2.88 kWh LiFePO4, 26.3 kg

function buildZendureAcPlusConfigs() {
  const configs = [];
  for (let hubs = 1; hubs <= 3; hubs++) {
    for (let bats = 0; bats <= 5; bats++) {
      const type = `ZSF2400AC+_${hubs}X${bats}`;
      const totalCapacity = hubs * (2.4 + bats * 2.88);
      const totalInverterPower = hubs * 2.4;
      const totalWeight = hubs * 27.8 + hubs * bats * 26.3;
      const hubLabel = hubs === 1 ? '1 hub' : `${hubs} hubs`;
      const batLabel = bats === 0 ? 'geen extra batterijen' : bats === 1 ? '1 AB3000L' : `${bats} AB3000L`;
      const model = `Solarflow 2400 AC+ (${hubLabel}, ${batLabel})`;

      configs.push({
        brand: 'Zendure',
        model,
        description: `Zendure Solarflow 2400 AC+ configuratie met ${hubLabel} en ${batLabel}. Totaal ${totalCapacity.toFixed(2)} kWh nuttige opslag.`,
        sheetConfigType: type,
        // No prices — those stay in the Google Sheet
        purchasePrice: 0,
        marginType: 'percent',
        marginValue: 0,
        discountType: 'percent',
        discountValue: 0,
        discountFromUnit: 2,
        isActive: true,
        sortOrder: (hubs - 1) * 6 + bats,
        specs: {
          // Computed totals
          capacityKwh: parseFloat(totalCapacity.toFixed(2)),
          inverterPowerKw: parseFloat(totalInverterPower.toFixed(1)),
          efficiency: 93,
          weightKg: parseFloat(totalWeight.toFixed(1)),
          // From spec page
          chemistry: 'LiFePO4',
          nominalVoltage: 48,
          cycleLife: 6000,
          maxChargePowerW: hubs * 2400,
          maxDischargePowerW: hubs * 2400,
          depthOfDischarge: 100,
          selfHeating: false, // Hub doesn't have self-heating; AB3000L has fire suppression
          peakPowerKw: parseFloat((hubs * 3.6).toFixed(1)),
          maxAcInputKw: parseFloat((hubs * 3.2).toFixed(1)),
          ipRating: 'IP65',
          operatingTempMin: -20,
          operatingTempMax: 55,
          connectivity: 'WiFi, Bluetooth',
          warrantyYears: 10,
          mountType: 'Muur',
          // Dimensions are per-hub so only set for 1-hub configs
          ...(hubs === 1 ? {
            heightMm: 326,
            widthMm: 294,
            depthMm: 251,
          } : {}),
        },
      });
    }
  }
  return configs;
}

// ─── MARSTEK VENUS E V03 CONFIGS ────────────────────────────────────────────
// From Google Sheet: MARVE03_XN  (N units)
// Per unit: 5.12 kWh, 2.5 kW inverter, 60 kg, 90% efficiency

function buildMarstekConfigs() {
  const configs = [];
  for (let units = 1; units <= 6; units++) {
    const type = `MARVE03_X${units}`;
    const totalCapacity = units * 5.12;
    const totalInverterPower = units * 2.5;
    const totalWeight = units * 60;
    const unitLabel = units === 1 ? '1 eenheid' : `${units} eenheden`;
    const model = `Venus E V03 (${unitLabel})`;

    configs.push({
      brand: 'Marstek',
      model,
      description: `Marstek Venus E V03 configuratie met ${unitLabel}. Totaal ${totalCapacity.toFixed(2)} kWh nuttige opslag.`,
      sheetConfigType: type,
      purchasePrice: 0,
      marginType: 'percent',
      marginValue: 0,
      discountType: 'percent',
      discountValue: 0,
      discountFromUnit: 2,
      isActive: true,
      sortOrder: 100 + units,
      specs: {
        capacityKwh: parseFloat(totalCapacity.toFixed(2)),
        inverterPowerKw: parseFloat(totalInverterPower.toFixed(1)),
        efficiency: 90,
        weightKg: totalWeight,
        chemistry: 'LiFePO4',
        cycleLife: 6000,
        depthOfDischarge: 100,
        warrantyYears: 10,
        // Marstek doesn't have detailed hub/module specs in the spec pages
        // so we only include what we know
        ...(units === 1 ? {
          heightMm: 680,
          widthMm: 450,
          depthMm: 200,
        } : {}),
      },
    });
  }
  return configs;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const batterijenId = await getOrCreateCategoryId('batterijen');
  console.log(`Found batterijen category: ${batterijenId}`);

  // Check for existing seeded products
  const existing = await db.collection('products').get();
  const existingTypes = new Set();
  existing.docs.forEach(d => {
    const data = d.data();
    if (data.sheetConfigType) existingTypes.add(data.sheetConfigType);
  });

  const zendureConfigs = buildZendureAcPlusConfigs();
  const marstekConfigs = buildMarstekConfigs();
  const allConfigs = [...zendureConfigs, ...marstekConfigs];

  let created = 0;
  let skipped = 0;
  const batch = db.batch();

  for (const config of allConfigs) {
    if (existingTypes.has(config.sheetConfigType)) {
      console.log(`  SKIP: ${config.sheetConfigType} (already exists)`);
      skipped++;
      continue;
    }

    const ref = db.collection('products').doc();
    batch.set(ref, {
      ...config,
      categoryId: batterijenId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'seed-script',
    });
    console.log(`  ADD: ${config.sheetConfigType} — ${config.brand} ${config.model}`);
    created++;
  }

  if (created > 0) {
    await batch.commit();
    console.log(`\nDone: ${created} products created, ${skipped} skipped.`);
  } else {
    console.log(`\nNothing to do: all ${skipped} products already exist.`);
  }

  await app.delete();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
