# Product Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Firestore-backed product management page (`producten-beheer.html`) that replaces the Google Sheet as the source of truth for individual products — covering settings, categories, CRUD, specs, photos and datasheets.

**Architecture:** New auth-gated backoffice page following the existing Bootstrap 5.3.3 + Firebase compat SDK pattern. Products and categories live in Firestore collections with CRUD helpers in `firebase-init.js`. Price calculation helpers (margin, discount, Bebat) are pure functions in `calc-engine.js` with full unit test coverage. The page is standalone — no changes to the existing calculator.

**Tech Stack:** HTML/CSS/JS (no build step), Bootstrap 5.3.3, Font Awesome 6.5.2, Firebase compat SDK 10.13.2 (Firestore + Storage + Auth), Vitest (unit tests), Playwright (E2E tests).

**Spec:** `docs/superpowers/specs/2026-05-09-product-management-design.md`

**Werkwijze per feature:**
1. Feature branch aanmaken vanuit `gh-pages`
2. Implementatie + unit tests + E2E tests
3. Alle tests groen (`npm run test:all`)
4. PR aanmaken
5. **Expliciete goedkeuring van Kevin** afwachten
6. Pas na go: merge naar `gh-pages`
7. Deploy Firestore rules via `node e2e/deploy-rules-default.cjs`

---

## File Structure Overview

### New files

| File | Purpose |
|------|---------|
| `producten-beheer.html` | Auth-gated product management page (settings, categories, product list, detail panel) |
| `assets/js/product-pricing.js` | Pure price calculation functions (ES module, DOM-free, testable) |
| `tests/product-pricing.test.js` | Unit tests for pricing helpers |
| `e2e/tests/product-settings.spec.js` | E2E tests for Feature 1 (settings + categories) |
| `e2e/tests/product-crud.spec.js` | E2E tests for Feature 2 (product CRUD) |
| `e2e/tests/product-specs.spec.js` | E2E tests for Feature 3 (specs per category) |
| `e2e/tests/product-media.spec.js` | E2E tests for Feature 4 (photos + datasheets) |
| `e2e/fixtures/test-datasheet.pdf` | Test PDF fixture for datasheet upload |

### Modified files

| File | Changes |
|------|---------|
| `assets/js/firebase-init.js` | Add settings, category, product CRUD helpers + media helpers |
| `firestore.rules` | Add rules for `productCategories`, `products`, `config/settings` |
| `storage.rules` | Add rule for `products/{id}/**` |
| `dashboard.html` | Add "Producten" nav link in navbar |
| `assets/css/smartpeak.css` | Minor additions for product page components (if needed) |

---

## Feature 1: Instellingen + Categorieën

**Branch:** `feat/product-settings`

### Task 1.1: Price calculation helpers + unit tests

**Files:**
- Create: `assets/js/product-pricing.js`
- Create: `tests/product-pricing.test.js`

- [ ] **Step 1: Create `assets/js/product-pricing.js` with all pure pricing functions**

```javascript
// assets/js/product-pricing.js
// Pure pricing helpers — ES module, no DOM dependencies.

/**
 * Calculate the sell price for a single unit of a product.
 * @param {Object} product
 * @param {number} product.purchasePrice - Aankoopprijs ex BTW
 * @param {'percent'|'fixed'} product.marginType
 * @param {number} product.marginValue - % or € amount
 * @returns {number} Sell price (ex BTW)
 */
export function sellPrice(product) {
  const pp = product.purchasePrice || 0;
  if (product.marginType === 'fixed') {
    return pp + (product.marginValue || 0);
  }
  // Default: percent
  return pp * (1 + (product.marginValue || 0) / 100);
}

/**
 * Calculate the unit price for unit number `n` (1-based).
 * Units below discountFromUnit pay full sellPrice.
 * Units >= discountFromUnit get the discount applied.
 * @param {Object} product
 * @param {number} n - 1-based unit number
 * @returns {number} Price for this unit (ex BTW)
 */
export function unitPrice(product, n) {
  const base = sellPrice(product);
  const from = product.discountFromUnit || 2;
  if (n < from) return base;
  if (product.discountType === 'fixed') {
    return base - (product.discountValue || 0);
  }
  // Default: percent
  return base * (1 - (product.discountValue || 0) / 100);
}

/**
 * Calculate total price for `qty` units of a product.
 * @param {Object} product
 * @param {number} qty
 * @returns {number} Total price (ex BTW)
 */
export function totalProductPrice(product, qty) {
  let total = 0;
  for (let i = 1; i <= qty; i++) {
    total += unitPrice(product, i);
  }
  return total;
}

/**
 * Calculate Bebat contribution for `qty` units of a product.
 * Always 21% BTW regardless of house age.
 * @param {Object} product - must have specs.weightKg
 * @param {number} qty
 * @param {number} bebatPricePerKg - €/kg from settings
 * @returns {number} Bebat contribution incl. 21% BTW
 */
export function bebatContribution(product, qty, bebatPricePerKg) {
  const weight = (product.specs && product.specs.weightKg) || 0;
  return qty * weight * (bebatPricePerKg || 0) * 1.21;
}

/**
 * Apply default pricing settings to a new product object.
 * @param {Object} settings - config/settings doc
 * @returns {Object} Pricing defaults to spread into a new product
 */
export function pricingDefaults(settings) {
  return {
    marginType:      settings.defaultMarginType || 'percent',
    marginValue:     settings.defaultMarginValue ?? 30,
    discountType:    settings.defaultDiscountType || 'percent',
    discountValue:   settings.defaultDiscountValue ?? 10,
    discountFromUnit: settings.defaultDiscountFromUnit ?? 2,
  };
}
```

- [ ] **Step 2: Create `tests/product-pricing.test.js` with full test coverage**

```javascript
// tests/product-pricing.test.js
import { describe, it, expect } from 'vitest';
import {
  sellPrice,
  unitPrice,
  totalProductPrice,
  bebatContribution,
  pricingDefaults,
} from '../assets/js/product-pricing.js';

// ─── sellPrice ─────────────────────────────────────────────

describe('sellPrice', () => {
  it('applies percent margin (30% on €1000 = €1300)', () => {
    const p = { purchasePrice: 1000, marginType: 'percent', marginValue: 30 };
    expect(sellPrice(p)).toBeCloseTo(1300);
  });

  it('applies fixed margin (€300 on €1000 = €1300)', () => {
    const p = { purchasePrice: 1000, marginType: 'fixed', marginValue: 300 };
    expect(sellPrice(p)).toBeCloseTo(1300);
  });

  it('handles 0% margin', () => {
    const p = { purchasePrice: 500, marginType: 'percent', marginValue: 0 };
    expect(sellPrice(p)).toBeCloseTo(500);
  });

  it('handles 0 fixed margin', () => {
    const p = { purchasePrice: 500, marginType: 'fixed', marginValue: 0 };
    expect(sellPrice(p)).toBeCloseTo(500);
  });

  it('handles missing purchasePrice', () => {
    const p = { marginType: 'percent', marginValue: 30 };
    expect(sellPrice(p)).toBe(0);
  });

  it('defaults to percent when marginType is missing', () => {
    const p = { purchasePrice: 1000, marginValue: 20 };
    expect(sellPrice(p)).toBeCloseTo(1200);
  });
});

// ─── unitPrice ─────────────────────────────────────────────

describe('unitPrice', () => {
  const base = {
    purchasePrice: 1000, marginType: 'percent', marginValue: 30,
    discountType: 'percent', discountValue: 10, discountFromUnit: 2,
  };

  it('unit 1 = full sell price (no discount)', () => {
    expect(unitPrice(base, 1)).toBeCloseTo(1300);
  });

  it('unit 2 = sell price minus 10% discount = €1170', () => {
    expect(unitPrice(base, 2)).toBeCloseTo(1170);
  });

  it('unit 5 = same discounted price', () => {
    expect(unitPrice(base, 5)).toBeCloseTo(1170);
  });

  it('fixed discount: unit 2 = sell price minus €200 = €1100', () => {
    const p = { ...base, discountType: 'fixed', discountValue: 200 };
    expect(unitPrice(p, 2)).toBeCloseTo(1100);
  });

  it('custom discountFromUnit: 3 → unit 2 = full price, unit 3 = discounted', () => {
    const p = { ...base, discountFromUnit: 3 };
    expect(unitPrice(p, 2)).toBeCloseTo(1300);
    expect(unitPrice(p, 3)).toBeCloseTo(1170);
  });

  it('0% discount = full price for all units', () => {
    const p = { ...base, discountValue: 0 };
    expect(unitPrice(p, 2)).toBeCloseTo(1300);
  });
});

// ─── totalProductPrice ─────────────────────────────────────

describe('totalProductPrice', () => {
  const base = {
    purchasePrice: 1000, marginType: 'percent', marginValue: 30,
    discountType: 'percent', discountValue: 10, discountFromUnit: 2,
  };

  it('qty 0 = €0', () => {
    expect(totalProductPrice(base, 0)).toBe(0);
  });

  it('qty 1 = €1300 (full price)', () => {
    expect(totalProductPrice(base, 1)).toBeCloseTo(1300);
  });

  it('qty 2 = €1300 + €1170 = €2470', () => {
    expect(totalProductPrice(base, 2)).toBeCloseTo(2470);
  });

  it('qty 5 = €1300 + 4 × €1170 = €5980', () => {
    expect(totalProductPrice(base, 5)).toBeCloseTo(5980);
  });
});

// ─── bebatContribution ─────────────────────────────────────

describe('bebatContribution', () => {
  it('calculates correctly with 21% BTW', () => {
    const p = { specs: { weightKg: 60 } };
    // 2 units × 60 kg × €0.50/kg × 1.21 = €72.60
    expect(bebatContribution(p, 2, 0.50)).toBeCloseTo(72.60);
  });

  it('returns 0 when weightKg is 0', () => {
    const p = { specs: { weightKg: 0 } };
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when weightKg is null', () => {
    const p = { specs: { weightKg: null } };
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when specs is missing', () => {
    const p = {};
    expect(bebatContribution(p, 3, 0.50)).toBe(0);
  });

  it('returns 0 when bebatPricePerKg is 0', () => {
    const p = { specs: { weightKg: 60 } };
    expect(bebatContribution(p, 2, 0)).toBe(0);
  });

  it('qty 1 × 26.1 kg × €0.42/kg × 1.21 = €13.27', () => {
    const p = { specs: { weightKg: 26.1 } };
    expect(bebatContribution(p, 1, 0.42)).toBeCloseTo(26.1 * 0.42 * 1.21);
  });
});

// ─── pricingDefaults ───────────────────────────────────────

describe('pricingDefaults', () => {
  it('extracts defaults from settings', () => {
    const settings = {
      defaultMarginType: 'percent',
      defaultMarginValue: 30,
      defaultDiscountType: 'fixed',
      defaultDiscountValue: 150,
      defaultDiscountFromUnit: 3,
    };
    expect(pricingDefaults(settings)).toEqual({
      marginType: 'percent',
      marginValue: 30,
      discountType: 'fixed',
      discountValue: 150,
      discountFromUnit: 3,
    });
  });

  it('falls back to sensible defaults when settings are empty', () => {
    expect(pricingDefaults({})).toEqual({
      marginType: 'percent',
      marginValue: 30,
      discountType: 'percent',
      discountValue: 10,
      discountFromUnit: 2,
    });
  });
});
```

- [ ] **Step 3: Run unit tests to verify they pass**

Run: `npm test -- tests/product-pricing.test.js`
Expected: All 20+ tests PASS.

- [ ] **Step 4: Commit**

```bash
git add assets/js/product-pricing.js tests/product-pricing.test.js
git commit -m "feat: add product pricing helpers with unit tests

Pure functions: sellPrice, unitPrice, totalProductPrice,
bebatContribution, pricingDefaults. Full test coverage for
percent/fixed margin and discount variants."
```

---

### Task 1.2: Firestore rules for settings, categories, products

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`

- [ ] **Step 1: Update `firestore.rules`**

Add these blocks inside the `match /databases/{database}/documents` block, after the existing `match /leads` block:

```javascript
    // ─── Product categories ────────────────────────────────────
    match /productCategories/{catId} {
      allow read:   if isWhitelisted();
      allow write:  if isWhitelisted();
    }

    // ─── Products ──────────────────────────────────────────────
    match /products/{productId} {
      allow read:   if isWhitelisted();
      allow write:  if isWhitelisted();

      match /photos/{photoId} {
        allow read:   if isWhitelisted();
        allow write:  if isWhitelisted();
      }
      match /datasheets/{dsId} {
        allow read:   if isWhitelisted();
        allow write:  if isWhitelisted();
      }
    }
```

Also **replace** the existing `config` rule:

```javascript
    // ─── Config ──────────────────────────────────────────────
    // 'products' is publicly readable (lead wizard needs it).
    // 'settings' is writable by whitelisted users.
    // All other config docs are read-only for whitelisted users.
    match /config/{docId} {
      allow read:  if docId == 'products' || isWhitelisted();
      allow write: if docId == 'settings' && isWhitelisted();
    }
```

- [ ] **Step 2: Update `storage.rules`**

Add this block after the existing `match /projects` block:

```javascript
    // Products: photos + datasheets
    match /products/{productId}/{allPaths=**} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.token.email in ['kevin@bloxit.be', 'ledsrepair@gmail.com'];
    }
```

- [ ] **Step 3: Deploy rules**

Run: `node e2e/deploy-rules-default.cjs`
Expected: "Deploy complete." with both releases updated.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "feat: add Firestore/Storage rules for products, categories, settings"
```

---

### Task 1.3: Firebase-init.js — settings + category CRUD helpers

**Files:**
- Modify: `assets/js/firebase-init.js`

- [ ] **Step 1: Add settings helpers**

Add these functions before the `// ─── EXPOSE HELPERS ON WINDOW` section at the end of `firebase-init.js`:

```javascript
// ─── SETTINGS ────────────────────────────────────────────────────────────────

async function getSettings() {
  const snap = await getDb().collection('config').doc('settings').get();
  return snap.exists ? snap.data() : {};
}

async function saveSettings(data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await getDb().collection('config').doc('settings').set({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  }, { merge: true });
}
```

- [ ] **Step 2: Add category CRUD helpers**

```javascript
// ─── PRODUCT CATEGORIES ──────────────────────────────────────────────────────

function categoriesCol() { return getDb().collection('productCategories'); }

async function listProductCategories() {
  const snap = await categoriesCol().orderBy('sortOrder').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createProductCategory(data) {
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const ref = await categoriesCol().add({
    name: data.name,
    slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    isDefault: data.isDefault || false,
    sortOrder: data.sortOrder ?? 999,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

async function updateProductCategory(id, data) {
  await categoriesCol().doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteProductCategory(id) {
  // Find the default category
  const allCats = await listProductCategories();
  const defaultCat = allCats.find(c => c.isDefault);
  if (!defaultCat) throw new Error('Geen default categorie gevonden');
  if (defaultCat.id === id) throw new Error('De default categorie kan niet verwijderd worden');

  // Move orphaned products to default category
  const orphans = await getDb().collection('products')
    .where('categoryId', '==', id).get();
  if (!orphans.empty) {
    const batch = getDb().batch();
    orphans.docs.forEach(doc => {
      batch.update(doc.ref, {
        categoryId: defaultCat.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // Delete the category
  await categoriesCol().doc(id).delete();
}

async function getDefaultCategory() {
  const snap = await categoriesCol().where('isDefault', '==', true).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/js/firebase-init.js
git commit -m "feat: add settings + category CRUD helpers to firebase-init.js"
```

---

### Task 1.4: producten-beheer.html — boilerplate + settings UI

**Files:**
- Create: `producten-beheer.html`

- [ ] **Step 1: Create the full page boilerplate with auth + settings card**

Create `producten-beheer.html` with the standard 3-state auth flow, navbar, and the settings card. The inline `<script type="module">` wires everything up.

The page structure:

```
<head>
  - Font Awesome 6.5.2 CSS (cdnjs, SRI)
  - Bootstrap 5.3.3 CSS (cdnjs, SRI)
  - smartpeak.css
  - Firebase compat SDK (app, auth, firestore, storage)
  - shared-helpers.js (module)
  - firebase-init.js (global)
  - product-pricing.js (module)
</head>
<body>
  #stateLoggedOut   — sign-in card (same pattern as dashboard.html)
  #stateNotWhitelisted — access denied (same pattern)
  #stateAuthorized
    <nav> — sticky navbar with "SmartPeak — Producten", "← Dashboard" link, user + sign-out
    <main>
      #settingsCard — collapsible card "Instellingen" with:
        - Default winstmarge (toggle %/vast + number)
        - Default korting (toggle %/vast + number)
        - Korting vanaf eenheid (number)
        - Standaard installatiekost (number)
        - Standaard keuringskost (number)
        - Bebat prijs/kg (number)
        - BTW Bebat (readonly 21%)
        - Voorschot (toggle %/vast + number, disabled label "toekomstig")
        - "Opslaan" button
      #categoryTabs — horizontal scrollable tabs ("Alle" + dynamic categories) + gear icon
      #productListArea — placeholder "(hier komen de producten)" for now
  #toastContainer
  #categoryModal — Bootstrap modal for category CRUD
  Bootstrap bundle JS (cdnjs, SRI)
  <script type="module"> — page wiring
</body>
```

The settings card fields each consist of:
- A label
- For toggle fields: a Bootstrap `btn-group` with two buttons (`%` and `€`) that toggle `active` class + a number input next to it
- For plain number fields: just a number input with `€` prefix in an `input-group`

The toggle state is stored in a data attribute (`data-type="percent"` or `data-type="fixed"`) on the btn-group wrapper.

Key behaviors to implement in the inline script:
- `loadSettings()` — reads `config/settings` via `getSettings()`, populates form
- `saveSettingsFromForm()` — reads form values, calls `saveSettings()`, shows toast
- `loadCategories()` — reads `productCategories`, renders tabs
- Category modal: list of name inputs with drag handles, add/delete/save
- Collapse state saved in `localStorage.smartpeak.settingsCollapsed`

**Implementation detail — toggle buttons for %/vast:**

```html
<div class="input-group">
  <div class="btn-group" role="group" data-type="percent" id="marginTypeToggle">
    <button type="button" class="btn btn-outline-secondary btn-sm active" data-val="percent">%</button>
    <button type="button" class="btn btn-outline-secondary btn-sm" data-val="fixed">€</button>
  </div>
  <input type="number" class="form-control" id="settingsMarginValue" min="0" step="1" value="30">
</div>
```

JS for toggle:
```javascript
document.querySelectorAll('[data-type]').forEach(group => {
  group.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      group.dataset.type = btn.dataset.val;
    });
  });
});
```

Reading toggle state:
```javascript
function readToggle(groupId) {
  return document.getElementById(groupId).dataset.type; // 'percent' or 'fixed'
}
```

- [ ] **Step 2: Verify page loads, auth works, settings save/load round-trips**

Run: `python3 -m http.server 8000` and visit `http://localhost:8000/producten-beheer.html`.
Expected: Sign in → settings card visible → fill values → save → toast → reload → values persisted.

- [ ] **Step 3: Commit**

```bash
git add producten-beheer.html
git commit -m "feat: add producten-beheer.html with settings UI + category tabs"
```

---

### Task 1.5: Dashboard navbar — "Producten" link

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Add nav link**

In `dashboard.html`, inside the `<ul class="navbar-nav ms-auto ...">` block, add a new `<li>` before the "Hallo" item:

```html
          <li class="nav-item">
            <a class="btn btn-outline-primary btn-sm" href="producten-beheer.html">
              <i class="fa-solid fa-boxes-stacked me-1"></i> Producten
            </a>
          </li>
```

- [ ] **Step 2: Verify link appears and navigates correctly**

- [ ] **Step 3: Commit**

```bash
git add dashboard.html
git commit -m "feat: add Producten nav link to dashboard navbar"
```

---

### Task 1.6: Seed default categories

**Files:**
- Modify: `producten-beheer.html` (inline script)

- [ ] **Step 1: Add category seeding logic**

In the `onAuthStateChanged` handler, after `showState('stateAuthorized')`, add a check that seeds default categories if none exist:

```javascript
async function seedDefaultCategories() {
  const cats = await listProductCategories();
  if (cats.length > 0) return; // Already seeded
  const defaults = [
    { name: 'Batterijen',  slug: 'batterijen',  isDefault: false, sortOrder: 0 },
    { name: 'Omvormers',   slug: 'omvormers',   isDefault: false, sortOrder: 1 },
    { name: 'Materiaal',   slug: 'materiaal',   isDefault: true,  sortOrder: 2 },
  ];
  for (const cat of defaults) {
    await createProductCategory(cat);
  }
}
```

Call `await seedDefaultCategories()` before `loadCategories()`.

- [ ] **Step 2: Verify — first load creates 3 categories, second load skips**

- [ ] **Step 3: Commit**

```bash
git add producten-beheer.html
git commit -m "feat: seed default product categories on first load"
```

---

### Task 1.7: E2E tests for settings + categories

**Files:**
- Create: `e2e/tests/product-settings.spec.js`

- [ ] **Step 1: Create the E2E test file**

```javascript
// e2e/tests/product-settings.spec.js
import { test, expect } from '../helpers/auth-fixture.js';
import { getAdminFirestore } from '../helpers/project-helpers.js';

test.describe('Product Settings & Categories', () => {

  test.afterAll(async () => {
    // Clean up test data from Firestore
    const db = getAdminFirestore();
    try {
      await db.doc('config/settings').delete();
    } catch {}
    // Clean up test categories (keep defaults by checking name prefix)
    const cats = await db.collection('productCategories').get();
    const batch = db.batch();
    cats.docs.forEach(d => {
      if (d.data().name.startsWith('E2E_')) batch.delete(d.ref);
    });
    await batch.commit();
  });

  test('settings: save and reload persists values', async ({ page }) => {
    await page.goto('/producten-beheer.html');

    // Open settings card if collapsed
    const settingsToggle = page.locator('#settingsCard .card-header');
    const settingsBody = page.locator('#settingsCard .card-body');
    if (!await settingsBody.isVisible()) {
      await settingsToggle.click();
      await settingsBody.waitFor({ state: 'visible' });
    }

    // Fill in marge = 25%
    await page.fill('#settingsMarginValue', '25');

    // Fill in korting = 15%
    await page.fill('#settingsDiscountValue', '15');

    // Fill in korting vanaf eenheid = 3
    await page.fill('#settingsDiscountFromUnit', '3');

    // Fill in installatiekost
    await page.fill('#settingsInstallCost', '300');

    // Fill in keuringskost
    await page.fill('#settingsInspectCost', '275');

    // Fill in Bebat prijs/kg
    await page.fill('#settingsBebatPerKg', '0.55');

    // Save
    await page.click('#btnSaveSettings');

    // Expect toast
    await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });

    // Reload and verify persistence
    await page.reload();
    await page.waitForSelector('#stateAuthorized', { state: 'visible', timeout: 15000 });

    // Open settings card
    const body2 = page.locator('#settingsCard .card-body');
    if (!await body2.isVisible()) {
      await page.locator('#settingsCard .card-header').click();
      await body2.waitFor({ state: 'visible' });
    }

    await expect(page.locator('#settingsMarginValue')).toHaveValue('25');
    await expect(page.locator('#settingsDiscountValue')).toHaveValue('15');
    await expect(page.locator('#settingsDiscountFromUnit')).toHaveValue('3');
    await expect(page.locator('#settingsInstallCost')).toHaveValue('300');
    await expect(page.locator('#settingsInspectCost')).toHaveValue('275');
    await expect(page.locator('#settingsBebatPerKg')).toHaveValue('0.55');
  });

  test('settings: toggle marge from % to fixed', async ({ page }) => {
    await page.goto('/producten-beheer.html');

    const body = page.locator('#settingsCard .card-body');
    if (!await body.isVisible()) {
      await page.locator('#settingsCard .card-header').click();
      await body.waitFor({ state: 'visible' });
    }

    // Click the "€" button in the margin toggle
    await page.click('#marginTypeToggle button[data-val="fixed"]');

    // Verify toggle state
    const toggle = page.locator('#marginTypeToggle');
    await expect(toggle).toHaveAttribute('data-type', 'fixed');

    // Save and reload
    await page.click('#btnSaveSettings');
    await page.reload();
    await page.waitForSelector('#stateAuthorized', { state: 'visible', timeout: 15000 });

    const body2 = page.locator('#settingsCard .card-body');
    if (!await body2.isVisible()) {
      await page.locator('#settingsCard .card-header').click();
      await body2.waitFor({ state: 'visible' });
    }

    await expect(page.locator('#marginTypeToggle')).toHaveAttribute('data-type', 'fixed');
  });

  test('categories: create new category appears as tab', async ({ page }) => {
    await page.goto('/producten-beheer.html');

    // Wait for category tabs to load
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10000 });

    // Open category modal
    await page.click('#btnManageCategories');
    await page.waitForSelector('#categoryModal', { state: 'visible' });

    // Click "Toevoegen"
    await page.click('#btnAddCategory');

    // Fill in the new category name
    const newInput = page.locator('#categoryModal .cat-name-input').last();
    await newInput.fill('E2E_TestCategory');

    // Save
    await page.click('#btnSaveCategories');

    // Wait for modal to close
    await page.waitForSelector('#categoryModal', { state: 'hidden', timeout: 5000 });

    // Verify new tab appears
    await expect(page.locator('#categoryTabs')).toContainText('E2E_TestCategory');
  });

  test('categories: delete category cascades products to default', async ({ page }) => {
    await page.goto('/producten-beheer.html');
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10000 });

    // Open category modal
    await page.click('#btnManageCategories');
    await page.waitForSelector('#categoryModal', { state: 'visible' });

    // Find the E2E_TestCategory row and click its delete button
    const row = page.locator('#categoryModal .cat-row', { hasText: 'E2E_TestCategory' });
    await row.locator('.btn-delete-cat').click();

    // Confirm deletion
    const confirmBtn = page.locator('#categoryModal .btn-confirm-delete');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Save
    await page.click('#btnSaveCategories');
    await page.waitForSelector('#categoryModal', { state: 'hidden', timeout: 5000 });

    // Verify tab is gone
    await expect(page.locator('#categoryTabs')).not.toContainText('E2E_TestCategory');
  });

  test('categories: cannot delete default category', async ({ page }) => {
    await page.goto('/producten-beheer.html');
    await page.waitForSelector('#categoryTabs', { state: 'visible', timeout: 10000 });

    // Open category modal
    await page.click('#btnManageCategories');
    await page.waitForSelector('#categoryModal', { state: 'visible' });

    // Find the default category row — its delete button should be disabled or absent
    const defaultRow = page.locator('#categoryModal .cat-row.is-default');
    const deleteBtn = defaultRow.locator('.btn-delete-cat');

    // Either the button doesn't exist or it's disabled
    const exists = await deleteBtn.count();
    if (exists > 0) {
      await expect(deleteBtn).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test e2e/tests/product-settings.spec.js --config=e2e/playwright.config.js`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npm run test:all`
Expected: All unit tests + E2E tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/product-settings.spec.js
git commit -m "test: add E2E tests for product settings and categories"
```

---

### Task 1.8: PR for Feature 1

- [ ] **Step 1: Push branch and create PR**

```bash
git push -u origin feat/product-settings
gh pr create --title "feat: product settings + categories" --body "$(cat <<'EOF'
## Summary
- New `producten-beheer.html` page with settings card and category management
- Pure pricing helpers (`product-pricing.js`) with full unit test coverage
- Firestore/Storage security rules for products, categories, settings
- Category CRUD with delete-cascade to default category
- Dashboard nav link to new page

## Test plan
- [ ] Unit tests pass (`npm test`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Manual: navigate from dashboard → producten, save settings, manage categories
- [ ] Manual: verify settings persist after reload

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for Kevin's approval before merging**

---

## Feature 2: Product CRUD Basis

**Branch:** `feat/product-crud` (from `gh-pages`, after Feature 1 is merged)

### Task 2.1: Firebase-init.js — product CRUD helpers

**Files:**
- Modify: `assets/js/firebase-init.js`

- [ ] **Step 1: Add product CRUD helpers**

Add after the category helpers:

```javascript
// ─── PRODUCTS ────────────────────────────────────────────────────────────────

function productsCol() { return getDb().collection('products'); }

async function listProducts(filters) {
  let query = productsCol();
  if (filters && filters.categoryId) {
    query = query.where('categoryId', '==', filters.categoryId);
  }
  if (filters && typeof filters.isActive === 'boolean') {
    query = query.where('isActive', '==', filters.isActive);
  }
  const snap = await query.orderBy('sortOrder').orderBy('brand').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getProduct(id) {
  const snap = await productsCol().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createProduct(data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const doc = {
    categoryId:      data.categoryId,
    brand:           data.brand || '',
    model:           data.model || '',
    description:     data.description || '',
    purchasePrice:   data.purchasePrice || 0,
    marginType:      data.marginType || 'percent',
    marginValue:     data.marginValue ?? 30,
    discountType:    data.discountType || 'percent',
    discountValue:   data.discountValue ?? 10,
    discountFromUnit: data.discountFromUnit ?? 2,
    specs:           data.specs || {},
    isActive:        true,
    sortOrder:       data.sortOrder ?? 0,
    createdAt:       now,
    updatedAt:       now,
    createdBy:       email,
    updatedBy:       email,
  };
  const ref = await productsCol().add(doc);
  return ref.id;
}

async function updateProduct(id, data) {
  const email = currentUserEmail();
  if (!email) throw new Error('Niet ingelogd');
  await productsCol().doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: email,
  });
}

async function deleteProduct(id) {
  // Cascade: delete photos subcollection
  const photosSnap = await productsCol().doc(id).collection('photos').get();
  if (!photosSnap.empty) {
    const batch = getDb().batch();
    for (const doc of photosSnap.docs) {
      // Delete storage blob
      try {
        const data = doc.data();
        if (data.storagePath) await getStorage().ref(data.storagePath).delete();
        if (data.thumbStoragePath) await getStorage().ref(data.thumbStoragePath).delete();
      } catch (e) { console.warn('Storage cleanup failed:', e.message); }
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Cascade: delete datasheets subcollection
  const dsSnap = await productsCol().doc(id).collection('datasheets').get();
  if (!dsSnap.empty) {
    const batch = getDb().batch();
    for (const doc of dsSnap.docs) {
      try {
        const data = doc.data();
        if (data.storagePath) await getStorage().ref(data.storagePath).delete();
      } catch (e) { console.warn('Storage cleanup failed:', e.message); }
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Delete the product document
  await productsCol().doc(id).delete();
}

async function toggleProductActive(id, isActive) {
  await updateProduct(id, { isActive });
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/firebase-init.js
git commit -m "feat: add product CRUD helpers to firebase-init.js"
```

---

### Task 2.2: producten-beheer.html — product list + detail panel

**Files:**
- Modify: `producten-beheer.html`

- [ ] **Step 1: Add product list UI (left panel)**

In `<main>`, after `#categoryTabs`, replace the `#productListArea` placeholder with the master-detail layout:

```html
<!-- Master-detail layout -->
<div class="row g-3" id="productLayout">
  <!-- Left: product list -->
  <div class="col-12 col-lg-5" id="productListCol">
    <div class="d-flex gap-2 mb-2">
      <div class="input-group flex-grow-1">
        <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="search" class="form-control" id="productSearch" placeholder="Zoek merk, model...">
      </div>
      <button class="btn btn-primary text-nowrap" id="btnNewProduct">
        <i class="fa-solid fa-plus me-1"></i> Nieuw product
      </button>
    </div>
    <div class="form-check form-switch mb-2">
      <input class="form-check-input" type="checkbox" id="toggleShowInactive">
      <label class="form-check-label" for="toggleShowInactive">Toon inactieve</label>
    </div>
    <div id="productList">
      <p class="sp-empty-state">Laden...</p>
    </div>
  </div>

  <!-- Right: detail panel (desktop) -->
  <div class="col-lg-7 d-none d-lg-block" id="productDetailCol">
    <div class="card" id="productDetailCard">
      <div class="card-body" id="productDetailBody">
        <p class="sp-empty-state">Selecteer een product of maak een nieuw product aan.</p>
      </div>
    </div>
  </div>
</div>

<!-- Detail drawer (mobile) -->
<div class="offcanvas offcanvas-end" tabindex="-1" id="productDrawer">
  <div class="offcanvas-header">
    <h5 class="offcanvas-title" id="productDrawerTitle">Product</h5>
    <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
  </div>
  <div class="offcanvas-body" id="productDrawerBody"></div>
</div>
```

- [ ] **Step 2: Add product list rendering + filtering logic**

In the inline `<script type="module">`:

```javascript
let _allProducts = [];
let _activeCategory = null; // null = "Alle"

async function loadProducts() {
  _allProducts = await listProducts();
  renderProductList();
}

function renderProductList() {
  const list = document.getElementById('productList');
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const showInactive = document.getElementById('toggleShowInactive').checked;

  let filtered = _allProducts;
  if (_activeCategory) {
    filtered = filtered.filter(p => p.categoryId === _activeCategory);
  }
  if (!showInactive) {
    filtered = filtered.filter(p => p.isActive !== false);
  }
  if (search) {
    filtered = filtered.filter(p =>
      (p.brand || '').toLowerCase().includes(search) ||
      (p.model || '').toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search)
    );
  }

  if (!filtered.length) {
    list.innerHTML = '<p class="sp-empty-state">Geen producten gevonden.</p>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const sp = sellPrice(p);
    const activeClass = p.isActive === false ? 'opacity-50' : '';
    const badge = p.isActive === false
      ? '<span class="badge text-bg-secondary ms-2">Inactief</span>' : '';
    return `
      <div class="card mb-2 product-card ${activeClass}" data-id="${p.id}" role="button">
        <div class="card-body py-2 px-3 d-flex align-items-center gap-2">
          <div class="flex-grow-1">
            <strong>${escapeHtml(p.brand)} ${escapeHtml(p.model)}</strong>${badge}
            <div class="text-muted small">${escapeHtml(p.description || '—')}</div>
          </div>
          <div class="text-end text-nowrap">
            <strong>€${sp.toFixed(2)}</strong>
            <div class="text-muted small">ex BTW</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Wire click handlers
  list.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProductDetail(card.dataset.id));
  });
}
```

- [ ] **Step 3: Add detail panel rendering (Blok A + B)**

```javascript
const BRAND_OPTIONS = {
  'Plug & Play': [
    'Marstek', 'Zendure', 'Growatt', 'EcoFlow', 'Anker Solix',
    'Hoymiles', 'Sunpura', 'Bluetti',
  ],
  'Installatie': [
    'Huawei', 'BYD', 'Dyness', 'Sigenergy', 'Enphase', 'Tesla',
    'Sonnen', 'LG', 'Solarwatt', 'Pylontech', 'Alpha ESS', 'SAJ',
    'Sungrow', 'Sessy',
  ],
};

function buildBrandOptions(selectedBrand) {
  let html = '<option value="">— Kies merk —</option>';
  for (const [group, brands] of Object.entries(BRAND_OPTIONS)) {
    html += `<optgroup label="${group}">`;
    brands.forEach(b => {
      html += `<option value="${b}" ${b === selectedBrand ? 'selected' : ''}>${b}</option>`;
    });
    html += '</optgroup>';
  }
  const isCustom = selectedBrand && !Object.values(BRAND_OPTIONS).flat().includes(selectedBrand);
  html += `<option value="__other__" ${isCustom ? 'selected' : ''}>Andere…</option>`;
  return html;
}

function renderProductDetail(product, mode) {
  // mode = 'view' | 'edit' | 'create'
  const isEdit = mode === 'edit' || mode === 'create';
  const p = product || {};
  const cats = /* pass categories array */;

  // Build form HTML with Blok A (basis) + Blok B (prijzen)
  // ... (complete form HTML with all fields, toggle buttons, live preview)
  // Wire live preview: on input change → recalculate sellPrice/unitPrice and display
}
```

The detail panel shows:
- **View mode:** readonly summary of all fields with "Bewerken" button
- **Edit/Create mode:** full form with:
  - Category dropdown (from loaded categories)
  - Brand dropdown (optgroups + "Andere" → shows text input)
  - Model (text input)
  - Omschrijving (textarea)
  - Aankoopprijs (number, required)
  - Winstmarge toggle + number + live preview verkoopprijs
  - Korting toggle + number + korting vanaf eenheid + live preview prijs 2e eenheid
  - Action buttons: Opslaan, Deactiveren/Heractiveren, Verwijderen

Live preview logic (on every input/change event):

```javascript
function updatePricePreview() {
  const p = readProductFromForm();
  const sp = sellPrice(p);
  const up2 = unitPrice(p, 2);
  document.getElementById('previewSellPrice').textContent = `€${sp.toFixed(2)}`;
  document.getElementById('previewUnit2Price').textContent = `€${up2.toFixed(2)}`;
}
```

- [ ] **Step 4: Wire product CRUD actions**

```javascript
async function saveProduct() {
  const data = readProductFromForm();
  // Validate required fields
  if (!data.categoryId) { showToast('Kies een categorie', 'danger'); return; }
  if (!data.brand) { showToast('Vul een merk in', 'danger'); return; }
  if (!data.model) { showToast('Vul een model in', 'danger'); return; }
  if (!data.purchasePrice || data.purchasePrice <= 0) {
    showToast('Vul een aankoopprijs in', 'danger'); return;
  }

  try {
    if (data.id) {
      await updateProduct(data.id, data);
      showToast('Product bijgewerkt', 'success');
    } else {
      const id = await createProduct(data);
      showToast('Product aangemaakt', 'success');
      data.id = id;
    }
    await loadProducts();
    openProductDetail(data.id);
  } catch (e) {
    showToast('Fout: ' + e.message, 'danger');
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add producten-beheer.html
git commit -m "feat: add product list + detail panel with CRUD"
```

---

### Task 2.3: E2E tests for product CRUD

**Files:**
- Create: `e2e/tests/product-crud-products.spec.js`

- [ ] **Step 1: Create E2E tests**

Test scenarios (same pattern as `product-settings.spec.js`):

1. **Product aanmaken**: navigate → click "Nieuw product" → fill fields (categorie: Batterijen, merk: Marstek, model: E2E_Test, aankoopprijs: 1000) → verify live preview shows €1300 → save → toast → product in list
2. **Product bewerken**: click product → edit → change aankoopprijs to 1200 → live preview updates → save → list shows new price
3. **Merk-dropdown "Andere"**: select "Andere" → text input appears → type custom brand → save → persists
4. **Korting toggle**: set korting to fixed €200 → preview shows correct 2nd unit price
5. **Categorie-filter**: click "Batterijen" tab → only battery products shown → click "Alle" → all shown
6. **Zoeken**: type in search → list filters
7. **Deactiveren**: click deactivate → product disappears from list → toggle "Toon inactieve" → shows greyed out → reactivate → back to normal
8. **Verwijderen**: click delete → confirm → product gone

Each test creates/uses products with names prefixed `E2E_Product_` for easy cleanup in `afterAll`.

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test e2e/tests/product-crud-products.spec.js --config=e2e/playwright.config.js`

- [ ] **Step 3: Run full test suite**

Run: `npm run test:all`

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/product-crud-products.spec.js
git commit -m "test: add E2E tests for product CRUD"
```

---

### Task 2.4: PR for Feature 2

- [ ] **Step 1: Push and create PR**

```bash
git push -u origin feat/product-crud
gh pr create --title "feat: product CRUD with list, detail panel, brand dropdown" --body "$(cat <<'EOF'
## Summary
- Product list with category filtering, search, active/inactive toggle
- Master-detail layout (desktop: side panel, mobile: offcanvas drawer)
- Detail panel with brand dropdown (22 pre-filled brands + "Andere")
- Live price preview (sell price + 2nd unit price)
- Product create, edit, deactivate, delete (with cascade)
- Full E2E test coverage

## Test plan
- [ ] Unit tests pass (`npm test`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Manual: create product, verify price preview
- [ ] Manual: filter by category, search
- [ ] Manual: deactivate + reactivate
- [ ] Manual: delete with confirm

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for Kevin's approval before merging**

---

## Feature 3: Spec-velden per categorie (high-level)

**Branch:** `feat/product-specs` (from `gh-pages`, after Feature 2 is merged)

### Task 3.1: Spec field definitions + category mapping

**Files:**
- Create: `assets/js/product-specs.js` (ES module)

Define the spec schema as a data structure:

```javascript
// assets/js/product-specs.js

/**
 * Named spec fields with type, unit, and label.
 * These are the "typed" fields that can be used in calculations.
 */
export const SPEC_FIELDS = [
  // Battery-specific
  { key: 'capacityKwh',       label: 'Nuttige capaciteit', unit: 'kWh',  type: 'number', categories: ['batterijen'] },
  { key: 'nominalVoltage',    label: 'Nominale spanning',  unit: 'V DC', type: 'number', categories: ['batterijen'] },
  { key: 'chemistry',         label: 'Cel-chemie',         unit: '',     type: 'select',  options: ['LiFePO4', 'NMC', 'LTO'], categories: ['batterijen'] },
  { key: 'cycleLife',         label: 'Cycli',              unit: 'cycli',type: 'number', categories: ['batterijen'] },
  { key: 'maxChargePowerW',   label: 'Max laadvermogen',   unit: 'W',    type: 'number', categories: ['batterijen'] },
  { key: 'maxDischargePowerW',label: 'Max ontlaadvermogen', unit: 'W',   type: 'number', categories: ['batterijen'] },
  { key: 'depthOfDischarge',  label: 'DoD',                unit: '%',    type: 'number', categories: ['batterijen'] },
  { key: 'selfHeating',       label: 'Vorstbescherming',   unit: '',     type: 'boolean', categories: ['batterijen'] },

  // Inverter-specific
  { key: 'inverterPowerKw',   label: 'Nominaal AC-vermogen', unit: 'kW', type: 'number', categories: ['omvormers'] },
  { key: 'peakPowerKw',       label: 'Piekvermogen',       unit: 'kW',   type: 'number', categories: ['omvormers'] },
  { key: 'maxAcInputKw',      label: 'Max AC input',       unit: 'kW',   type: 'number', categories: ['omvormers'] },
  { key: 'maxPvInputKw',      label: 'Max PV input',       unit: 'kW',   type: 'number', categories: ['omvormers'] },
  { key: 'mpptCount',         label: 'MPPT-trackers',      unit: '',     type: 'number', categories: ['omvormers'] },
  { key: 'phases',            label: 'Fasen',              unit: '',     type: 'select',  options: [1, 3], categories: ['omvormers'] },

  // Shared
  { key: 'efficiency',        label: 'Rendement',          unit: '%',    type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'weightKg',          label: 'Gewicht',            unit: 'kg',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'heightMm',          label: 'Hoogte',             unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'widthMm',           label: 'Breedte',            unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'depthMm',           label: 'Diepte',             unit: 'mm',   type: 'number', categories: ['batterijen', 'omvormers', 'materiaal'] },
  { key: 'ipRating',          label: 'IP-bescherming',     unit: '',     type: 'text',   categories: ['batterijen', 'omvormers'] },
  { key: 'operatingTempMin',  label: 'Bedrijfstemp. min',  unit: '°C',   type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'operatingTempMax',  label: 'Bedrijfstemp. max',  unit: '°C',   type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'connectivity',      label: 'Connectiviteit',     unit: '',     type: 'text',   categories: ['batterijen', 'omvormers'] },
  { key: 'warrantyYears',     label: 'Garantie',           unit: 'jaar', type: 'number', categories: ['batterijen', 'omvormers'] },
  { key: 'mountType',         label: 'Montage',            unit: '',     type: 'select',  options: ['Muur', 'Vloer', 'Rack'], categories: ['batterijen', 'omvormers'] },
  { key: 'noiseLevel',        label: 'Geluidsniveau',      unit: 'dB',   type: 'number', categories: ['batterijen', 'omvormers'] },
];

/**
 * Get spec fields visible for a given category slug.
 * Unknown categories get only the shared fields (weightKg, dimensions).
 */
export function specsForCategory(categorySlug) {
  const slug = (categorySlug || '').toLowerCase();
  return SPEC_FIELDS.filter(f => f.categories.includes(slug));
}
```

### Task 3.2: Blok C UI in detail panel

**Files:**
- Modify: `producten-beheer.html`

Add Blok C to the detail panel render function. For each spec field returned by `specsForCategory(slug)`, render the appropriate input:
- `number` → `<input type="number">` with unit label
- `text` → `<input type="text">`
- `select` → `<select>` with options
- `boolean` → `<input type="checkbox">`

Plus a "Custom specs" section at the bottom:
- Key/value list with `+ Toevoegen` button
- Each row: text input for key + text input for value + delete button
- Stored in `specs.custom` map

On category change in the form → re-render spec fields (show/hide).

### Task 3.3: Unit tests for spec mapping

**Files:**
- Create: `tests/product-specs.test.js`

Test `specsForCategory('batterijen')` returns battery fields, `specsForCategory('omvormers')` returns inverter fields, unknown slug returns shared-only fields.

### Task 3.4: E2E tests + PR

**Files:**
- Create: `e2e/tests/product-specs.spec.js`

Test scenarios:
1. Create battery product → battery-specific fields visible (capacityKwh, chemistry, etc.)
2. Switch category to omvormers → inverter fields visible, battery fields hidden
3. Fill specs → save → reload → values persisted
4. Add custom spec (key: "Kleur", value: "Zwart") → save → reload → persisted
5. Delete custom spec → save → gone

PR: same workflow as Features 1/2.

---

## Feature 4: Product Media — Foto's + Datasheets (high-level)

**Branch:** `feat/product-media` (from `gh-pages`, after Feature 3 is merged)

### Task 4.1: Firebase-init.js — product media helpers

**Files:**
- Modify: `assets/js/firebase-init.js`

Add helpers (follow the existing project photo pattern):

```javascript
// Product photos
async function uploadProductPhoto(productId, file) { /* ... */ }
async function deleteProductPhoto(productId, photoId) { /* ... */ }
async function listProductPhotos(productId) { /* ... */ }

// Product datasheets
async function uploadProductDatasheet(productId, file) { /* ... */ }
async function deleteProductDatasheet(productId, dsId) { /* ... */ }
async function listProductDatasheets(productId) { /* ... */ }
```

Storage paths:
- Photos: `products/{id}/{ts}_{name}` + `products/{id}/{ts}_{name}_thumb.jpg`
- Datasheets: `products/{id}/datasheets/{ts}_{filename}`

Photo upload reuses the existing thumbnail generation pattern from `photo-uploader.js` (canvas resize to 400px max side, JPEG q=0.82).

### Task 4.2: Blok D UI — photo uploader + datasheet list

**Files:**
- Modify: `producten-beheer.html`

Two approaches for the photo section:
1. **Reuse `photo-uploader.js`** — mount via `mountPhotoUploader(container, opts)` with `opts.collectionPath = 'products/{id}/photos'` and `opts.storagePath = 'products/{id}'`. Skip the tag-modal (no situatie/serial distinction for products).
2. If the existing component is too tightly coupled to project photos, create a simplified version.

Datasheet section:
- Drop-zone for PDF upload (max 10 MB, PDF-only validation)
- List of uploaded datasheets: filename + size + download link + delete button
- Upload progress via Bootstrap progress bar

### Task 4.3: E2E tests + PR

**Files:**
- Create: `e2e/tests/product-media.spec.js`
- Create: `e2e/fixtures/test-datasheet.pdf` (copy of `test-offerte.pdf`)

Test scenarios:
1. Upload photo → thumbnail appears in grid
2. Delete photo → disappears from grid
3. Upload PDF datasheet → appears in list with filename
4. Download datasheet → file downloads
5. Delete datasheet → removed from list
6. Delete product → cascade deletes all photos + datasheets from Storage

PR: same workflow.

---

## Appendix: Context Reference

### Pricing model explained

```
Verkoopprijs = aankoopprijs + marge (% of vast)
Eenheidsprijs(n) = verkoopprijs - korting (% of vast)   als n >= kortingVanafEenheid
                 = verkoopprijs                           als n < kortingVanafEenheid

Voorbeeld: aankoop €1000, 30% marge, 10% korting vanaf 2e:
  Eenheid 1: €1300 (vol)
  Eenheid 2: €1170 (10% korting op €1300)
  Eenheid 3: €1170
  Totaal 3:  €1300 + €1170 + €1170 = €3640

Installatiekost: vast bedrag per combo (standaard €250 ex BTW)
Keuring: vast bedrag optioneel (standaard €250 ex BTW)
Meerkost: per project, handmatig
BTW: 6% (woning >10j) of 21% (woning <10j) op alles behalve Bebat
Bebat: totaal gewicht × prijs/kg × 1.21 (altijd 21%)
```

### Brand dropdown — pre-filled merken (Belgische markt 2025-2026)

**Plug & Play:** Marstek, Zendure, Growatt, EcoFlow, Anker Solix, Hoymiles, Sunpura, Bluetti
**Installatie:** Huawei, BYD, Dyness, Sigenergy, Enphase, Tesla, Sonnen, LG, Solarwatt, Pylontech, Alpha ESS, SAJ, Sungrow, Sessy
**Altijd:** "Andere" → vrij tekstveld

### Spec fields per category

| Veld | Batterij | Omvormer | Materiaal |
|------|----------|----------|-----------|
| capacityKwh, nominalVoltage, chemistry, cycleLife, maxCharge/DischargePowerW, DoD, selfHeating | x | | |
| inverterPowerKw, peakPowerKw, maxAcInputKw, maxPvInputKw, mpptCount, phases | | x | |
| efficiency | x | x | |
| weightKg, hoogte/breedte/diepte, ipRating, temp min/max, connectivity, garantie, montage, geluid | x | x | |
| weightKg, hoogte/breedte/diepte | | | x |
| custom (key/value map) | x | x | x |

### Firestore collections (new)

```
config/settings          — pricing defaults, installation/inspection costs, Bebat
productCategories/{id}   — dynamic categories with CRUD
products/{id}            — individual products with pricing + specs
  /photos/{photoId}      — product photos (with thumbnails)
  /datasheets/{dsId}     — PDF datasheets
```

### Toekomstige fases (out of scope)

- **Fase 2:** Combinaties-pagina — producten samenvoegen tot configs, vervangt Google Sheet
- **Fase 3:** Billit-koppeling — offerte/factuur generatie, voorschot/eindfactuur flow
