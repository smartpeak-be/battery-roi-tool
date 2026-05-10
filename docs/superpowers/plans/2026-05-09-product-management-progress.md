# Product Management — Implementation Progress

**Branch:** `feat/product-media` (worktree at `.worktrees/feat-product-media`)
**PR:** #28 (Feature 4: Product Media — open, awaiting merge)
**Plan:** `docs/superpowers/plans/2026-05-09-product-management.md`
**Spec:** `docs/superpowers/specs/2026-05-09-product-management-design.md`

## Completed Features (merged to branch)

### Feature 1: Product Settings Page (PR #25, merged)
- `producten-beheer.html` — new backoffice page
- Category CRUD (tabs, drag-reorder, inline rename, delete)
- `seedDefaultCategories()` seeds 4 defaults when empty

### Feature 2: Product CRUD (PR #26, merged)
- Product list with category filter tabs ("Alle" + per category)
- Product detail panel (right side): brand, model, description, pricing
- Brand dropdown with autocomplete
- `listProducts()`, `createProduct()`, `updateProduct()`, `deleteProduct()` in `firebase-init.js`

### Feature 3: Spec Fields per Category (PR #27, merged)
- `assets/js/product-specs.js` — `SPEC_FIELDS` array + `specsForCategory(slug)`
- Spec form fields rendered dynamically based on category slug
- Custom specs (free key-value pairs) support
- E2E tests in `e2e/tests/product-settings.spec.js`

### Feature 4: Product Media — Photos + Datasheets (PR #28, open)
- Product photo upload (reuses `photo-uploader.js` pattern)
- Datasheet PDF upload/download/delete
- Photo grid + lightbox in product detail
- E2E tests in `e2e/tests/product-media.spec.js` (5 tests, all pass)

## Current Session Work (2026-05-09, committed as WIP)

### Done this session

1. **Replaced 24 configuration-combination products with 3 individual products**
   - Old: seed script created all combos (1 hub + 0 bat, 1 hub + 1 bat, etc.)
   - New: only individual purchasable units:
     - **Zendure Solarflow 2400 AC+** — all-in-one hub with built-in 2.4 kWh battery + 2.4 kW inverter
     - **Zendure AB3000L** — expansion battery, 2.88 kWh
     - **Marstek Venus E V03** — all-in-one with 5.12 kWh battery + 2.5 kW inverter
   - Configuration combos are a separate future feature

2. **Created "Thuisbatterij-systemen" category** (slug: `thuisbatterij-systemen`)
   - For all-in-one units that contain both a battery AND inverter
   - sortOrder 0 (first tab), followed by Batterijen(1), Omvormers(2), Materiaal(3)
   - Updated `seedDefaultCategories()` in producten-beheer.html
   - Updated `seed-products.js` with new category defaults

3. **Added `thuisbatterij-systemen` to `product-specs.js` SPEC_FIELDS**
   - Battery specs: capacityKwh, nominalVoltage, chemistry, cycleLife, maxChargePowerW, maxDischargePowerW, depthOfDischarge, selfHeating
   - Inverter specs: inverterPowerKw, peakPowerKw, maxAcInputKw
   - Shared specs: efficiency, weightKg, dimensions, ipRating, temps, connectivity, warranty, mountType, noiseLevel
   - NOT included (inverter-only): maxPvInputKw, mpptCount, phases

4. **Added utility scripts**
   - `scripts/check-db.js` — reads both default and named DB to compare
   - `scripts/fix-category-ids.js` — one-time cleanup for category duplicates

### Database state (Firestore)
- **4 categories** in `productCategories`: Thuisbatterij-systemen, Batterijen, Omvormers, Materiaal
- **4 products** in `products`:
  - 3 seeded (via seed-products.js): 2400 AC+, AB3000L, Venus E V03
  - 1 manually created by user: "Marstek Venus e V3" (may be duplicate of seeded Venus E V03)
- Default DB and named DB (`smartpeak-battery-roi-be`) are THE SAME database — confirmed empirically

## BUG: Specs not rendering for Thuisbatterij-systemen — RESOLVED (2026-05-10)

### Symptom
When clicking a product in the "Thuisbatterij-systemen" category, the spec fields section showed:
> "Kies een categorie om specificatievelden te zien."

### Root Causes (TWO)

**Root cause 1 — Missing slug in SPEC_FIELDS (code bug)**
`product-specs.js` SPEC_FIELDS entries did not include `'thuisbatterij-systemen'` in their `categories` arrays. So `specsForCategory('thuisbatterij-systemen')` returned 0 fields, triggering the fallback message.

**Fix:** Added `'thuisbatterij-systemen'` to all relevant SPEC_FIELDS entries (battery specs, inverter specs except PV-only ones, and shared specs). Now returns 23 fields.

**Root cause 2 — Empty specs in Firestore (data corruption)**
While root cause 1 was active, saving a product through the UI caused `saveProductFromForm()` to overwrite `specs` with `{}` (empty object) because no spec fields were rendered — there were no inputs to read values from. All 3 seeded products had their specs wiped this way.

**Fix:** Created `scripts/reseed-specs.js` which matches products by brand+model and restores spec values from the seed data. Run result:
- Zendure Solarflow 2400 AC+: restored 22 spec fields
- Zendure AB3000L: already had 7 keys (batterijen category was unaffected)
- Marstek Venus E V03: restored 11 spec fields

### Verification
E2E test confirmed:
- `specsForCategory('thuisbatterij-systemen')` returns 23 fields
- 22 of 23 spec inputs filled with correct values (only `noiseLevel` empty — not in seed data)

## Next Steps

1. Merge PR #28 (Feature 4: Product Media)
2. Continue with remaining product management features from the plan
