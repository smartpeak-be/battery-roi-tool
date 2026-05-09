#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const admin = require('firebase-admin');
const sa = require(join(__dirname, '..', 'e2e', 'service-account-key.json'));

const app = admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = app.firestore();
// Use default database — the compat web SDK falls back to default.

async function main() {
  // All categories
  const cats = await db.collection('productCategories').get();
  console.log('=== ALL CATEGORIES ===');
  cats.docs.forEach(d => {
    const data = d.data();
    console.log(`  ID: ${d.id} | name: ${data.name} | slug: ${data.slug} | isDefault: ${data.isDefault}`);
  });

  // All products grouped by categoryId
  const prods = await db.collection('products').get();
  console.log(`\n=== ALL PRODUCTS (${prods.size}) ===`);
  const byCat = {};
  prods.docs.forEach(d => {
    const data = d.data();
    const catId = data.categoryId || '(none)';
    if (!byCat[catId]) byCat[catId] = [];
    byCat[catId].push({ id: d.id, brand: data.brand, model: data.model, createdBy: data.createdBy });
  });
  for (const [catId, items] of Object.entries(byCat)) {
    const catDoc = cats.docs.find(c => c.id === catId);
    const catName = catDoc ? catDoc.data().name : '??? MISSING CATEGORY';
    console.log(`\n  Category: ${catId} (${catName}) - ${items.length} products`);
    items.forEach(p => console.log(`    ${p.id} - ${p.brand} ${p.model} | createdBy: ${p.createdBy}`));
  }

  await app.delete();
}

main().catch(console.error);
