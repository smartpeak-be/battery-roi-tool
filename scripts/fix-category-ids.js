#!/usr/bin/env node
// Fix: ensure the seed-created Batterijen category is the only one,
// and re-link all products to it. Delete any duplicate categories.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require('firebase-admin');
const sa = require(join(__dirname, '..', 'e2e', 'service-account-key.json'));

const app = admin.initializeApp({
  credential: admin.credential.cert(sa),
});
const db = app.firestore();
// Use default database — the compat web SDK falls back to default.

async function main() {
  // 1. Find all Batterijen categories
  const allCats = await db.collection('productCategories').get();
  console.log(`Found ${allCats.size} total categories`);
  allCats.docs.forEach(d => {
    const data = d.data();
    console.log(`  ${d.id} - ${data.name} (slug: ${data.slug})`);
  });

  // 2. Delete ALL existing categories — we'll recreate the 3 defaults cleanly
  console.log('\nDeleting all existing categories...');
  for (const doc of allCats.docs) {
    await doc.ref.delete();
    console.log(`  Deleted: ${doc.id}`);
  }

  // 3. Create the 3 default categories (same as ensureDefaultCategories in the app)
  const defaults = [
    { name: 'Batterijen', slug: 'batterijen', isDefault: false, sortOrder: 0 },
    { name: 'Omvormers', slug: 'omvormers', isDefault: false, sortOrder: 1 },
    { name: 'Materiaal', slug: 'materiaal', isDefault: true, sortOrder: 2 },
  ];

  const newCatIds = {};
  for (const cat of defaults) {
    const ref = await db.collection('productCategories').add({
      ...cat,
      specFields: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    newCatIds[cat.slug] = ref.id;
    console.log(`  Created ${cat.name}: ${ref.id}`);
  }

  // 4. Update all products to point to the new Batterijen category
  const batterijenId = newCatIds['batterijen'];
  const prods = await db.collection('products').get();
  console.log(`\nUpdating ${prods.size} products to categoryId: ${batterijenId}`);

  const batch = db.batch();
  let updated = 0;
  for (const doc of prods.docs) {
    const data = doc.data();
    if (data.categoryId !== batterijenId) {
      batch.update(doc.ref, {
        categoryId: batterijenId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updated++;
    }
  }

  if (updated > 0) {
    await batch.commit();
  }
  console.log(`Updated ${updated} products, ${prods.size - updated} already correct.`);

  // 5. Verify
  const verifyCats = await db.collection('productCategories').get();
  console.log('\n=== VERIFICATION ===');
  console.log(`Categories: ${verifyCats.size}`);
  verifyCats.docs.forEach(d => {
    const data = d.data();
    console.log(`  ${d.id} - ${data.name} (slug: ${data.slug})`);
  });

  const verifyProds = await db.collection('products').where('categoryId', '==', batterijenId).get();
  console.log(`Products in Batterijen: ${verifyProds.size}`);

  console.log('\nDone.');
  await app.delete();
}

main().catch(console.error);
