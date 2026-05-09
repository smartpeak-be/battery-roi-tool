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

## BUG: Specs not rendering for Thuisbatterij-systemen

### Symptom
When clicking a product in the "Thuisbatterij-systemen" category, the spec fields section shows:
> "Kies een categorie om specificatievelden te zien."

instead of the spec input fields.

### What we know
- The message comes from `producten-beheer.html:1170-1172` — the `renderSpecFields()` fallback when `fields.length === 0`
- `renderSpecFields(container, categoryId, specs)` calls `getCategorySlug(categoryId)` which looks up the category in `_categories` by ID
- `specsForCategory(slug)` in `product-specs.js` now includes `'thuisbatterij-systemen'` — this part is fixed
- The `_categories` array is loaded from Firestore via `listProductCategories()` and should contain the thuisbatterij-systemen category with its correct slug

### What to debug next session
1. Open browser console on producten-beheer.html
2. Click a thuisbatterij-systemen product (e.g. 2400 AC+)
3. Add a `console.log` or breakpoint in `renderSpecFields()` at line 1163:
   ```js
   console.log('renderSpecFields', { categoryId, slug, fieldsCount: fields.length, _categories });
   ```
4. Check:
   - Is `categoryId` correct (matches the Firestore category doc ID)?
   - Does `getCategorySlug(categoryId)` return `'thuisbatterij-systemen'`?
   - Does `specsForCategory('thuisbatterij-systemen')` return 19 fields (not 0)?
   - Is `_categories` populated at that point? (timing issue?)
5. If `getCategorySlug` returns empty string, the category ID on the product doesn't match any ID in `_categories` — possibly the category was recreated with a different doc ID after seeding

### Likely root cause hypotheses
- **H1**: The Firestore category document ID stored on the product (`categoryId`) doesn't match the ID of the category in `_categories` — could happen if categories were deleted and recreated (different auto-generated IDs)
- **H2**: Timing — `_categories` not yet loaded when `renderSpecFields` is called
- **H3**: The category select dropdown in the product detail form has the wrong value

## Next Steps

1. Fix the specs rendering bug (see debug plan above)
2. Merge PR #28 (Feature 4: Product Media)
3. Continue with remaining product management features from the plan
