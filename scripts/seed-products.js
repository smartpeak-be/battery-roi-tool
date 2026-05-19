#!/usr/bin/env node
// scripts/seed-products.js
// One-time seed script to populate the products collection with individual
// hardware products (NOT configuration combinations — those are a separate
// feature). Each product represents a single purchasable unit.
//
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

// ─── LOOK UP CATEGORY IDs ──────────────────────────────────────────────────

async function getOrCreateCategoryId(slug) {
  const snap = await db.collection('productCategories')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;

  // Category doesn't exist — create it (same defaults as producten-beheer.html)
  const defaults = {
    'thuisbatterij-systemen': { name: 'Thuisbatterij-systemen', slug: 'thuisbatterij-systemen', isDefault: false, sortOrder: 0 },
    batterijen:  { name: 'Batterijen',  slug: 'batterijen',  isDefault: false, sortOrder: 1 },
    omvormers:   { name: 'Omvormers',   slug: 'omvormers',   isDefault: false, sortOrder: 2 },
    materiaal:   { name: 'Materiaal',   slug: 'materiaal',   isDefault: true,  sortOrder: 3 },
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

// ─── PRODUCT DEFINITIONS ────────────────────────────────────────────────────
// Individual hardware products with specs from manufacturer spec pages.
// Prices are NOT seeded — those are managed via the producten-beheer UI.

const PRODUCTS = [
  // ── Zendure Solarflow 2400 AC+ (hub with built-in battery + inverter) ──
  {
    category: 'thuisbatterij-systemen',
    seedKey: 'zendure-solarflow-2400-ac-plus',
    brand: 'Zendure',
    model: 'Solarflow 2400 AC+',
    description: 'Plug-and-play thuisbatterij-hub met ingebouwde 2.4 kWh LiFePO4 batterij en 2.4 kW hybride omvormer. Uitbreidbaar met max 5 AB3000L batterijen per hub, tot 3 hubs parallel.',
    sortOrder: 0,
    specs: {
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
  },

  // ── Zendure AB3000L (expansion battery) ──
  {
    category: 'batterijen',
    seedKey: 'zendure-ab3000l',
    brand: 'Zendure',
    model: 'AB3000L',
    description: 'Uitbreidingsbatterij voor de Solarflow 2400 AC+. 2.88 kWh LiFePO4, tot 5 stuks per hub.',
    sortOrder: 0,
    specs: {
      capacityKwh: 2.88,
      weightKg: 26.3,
      chemistry: 'LiFePO4',
      cycleLife: 6000,
      depthOfDischarge: 100,
      warrantyYears: 10,
    },
  },

  // ── Marstek Venus E V03 (all-in-one with built-in battery + inverter) ──
  {
    category: 'thuisbatterij-systemen',
    seedKey: 'marstek-venus-e-v03',
    brand: 'Marstek',
    model: 'Venus E V03',
    description: 'All-in-one thuisbatterij met ingebouwde 5.12 kWh LiFePO4 batterij en 2.5 kW omvormer. Tot 6 eenheden parallel schakelbaar.',
    sortOrder: 1,
    specs: {
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
  },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve category IDs
  const categoryIds = {};
  for (const slug of ['thuisbatterij-systemen', 'batterijen', 'omvormers', 'materiaal']) {
    categoryIds[slug] = await getOrCreateCategoryId(slug);
    console.log(`Category ${slug}: ${categoryIds[slug]}`);
  }

  // Check for existing seeded products (by seedKey)
  const existing = await db.collection('products').get();
  const existingKeys = new Set();
  existing.docs.forEach(d => {
    const data = d.data();
    if (data.seedKey) existingKeys.add(data.seedKey);
  });

  let created = 0;
  let skipped = 0;

  for (const product of PRODUCTS) {
    if (existingKeys.has(product.seedKey)) {
      console.log(`  SKIP: ${product.brand} ${product.model} (already exists)`);
      skipped++;
      continue;
    }

    const { category, ...productData } = product;
    const ref = await db.collection('products').add({
      ...productData,
      categoryId: categoryIds[category],
      purchasePrice: 0,
      marginType: 'percent',
      marginValue: 0,
      discountType: 'percent',
      discountValue: 0,
      discountFromUnit: 2,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'seed-script',
    });
    console.log(`  ADD: ${product.brand} ${product.model} → ${category} (${ref.id})`);
    created++;
  }

  console.log(`\nDone: ${created} products created, ${skipped} skipped.`);
  await app.delete();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
