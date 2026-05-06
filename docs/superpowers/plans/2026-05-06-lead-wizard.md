# Lead Wizard & Result Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build public embeddable pages that let potential customers upload their Fluvius CSV and receive a personalised battery ROI analysis via email.

**Architecture:** Two new HTML pages (`lead.html` wizard, `lead-result.html` permalink) with a shared `lead-calc.js` ES module for best-ROI selection logic. Leads stored in a separate Firestore `leads` collection. Email via Firebase Extension "Trigger Email from Firestore". Dashboard gets a read-only leads section.

**Tech Stack:** Vanilla JS (ES modules), Bootstrap 5.3.3 (CDN), Firebase compat SDK 10.13.2 (CDN), Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-06-lead-wizard-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `assets/js/lead-calc.js` | Create | Pure logic: resolve defaults, select best config, build result/notes |
| `lead.html` | Create | Multi-step wizard (CSV + contact + options + confirmation) |
| `lead-result.html` | Create | Result permalink page (card + recovery bars + CTA) |
| `assets/js/firebase-init.js` | Modify | Add `createLead`, `listLeads`, `updateLeadToHot`, `createMailDoc` |
| `assets/css/smartpeak.css` | Modify | Add wizard step indicator + lead result card styles |
| `dashboard.html` | Modify | Add leads section with list + "Maak project aan" |
| `eslint.config.js` | Modify | Add `lead-calc.js` to ES modules section, new globals |
| `tests/lead-calc.test.js` | Create | Unit tests for lead-calc.js |
| `e2e/tests/lead-wizard.spec.js` | Create | E2E tests for wizard flow |
| `e2e/tests/lead-result.spec.js` | Create | E2E tests for result page |

---

### Task 1: Lead calc module — tests (TDD red phase)

**Files:**
- Create: `tests/lead-calc.test.js`
- Create: `assets/js/lead-calc.js` (stub exports only)

- [ ] **Step 1: Create stub module with empty exports**

Create `assets/js/lead-calc.js`:

```javascript
// Lead-specific calculation logic: resolve defaults, select best config, build result.
// Pure functions — no DOM, no Firestore.

import { processDataPure, parseSheetConfigs } from './calc-engine.js';

export const LEAD_DEFAULTS = {
  pvInverterKw: 3.5,
  pricePerKwh: 0.34,
  btw: 21
};

export function resolveLeadInputs(raw) {
  throw new Error('Not implemented');
}

export function selectBestConfig(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw) {
  throw new Error('Not implemented');
}

export function buildLeadResult(configResult) {
  throw new Error('Not implemented');
}

export function buildDefaultsNotes(defaultsUsed) {
  throw new Error('Not implemented');
}
```

- [ ] **Step 2: Write unit tests**

Create `tests/lead-calc.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  LEAD_DEFAULTS,
  resolveLeadInputs,
  selectBestConfig,
  buildLeadResult,
  buildDefaultsNotes
} from '../assets/js/lead-calc.js';

// ─── resolveLeadInputs ─────────────────────────────────────────────────

describe('resolveLeadInputs', () => {
  it('uses all defaults when nothing provided', () => {
    const result = resolveLeadInputs({});
    expect(result.pvInverterKw).toBe(3.5);
    expect(result.pricePerKwh).toBe(0.34);
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.pvInverterKw).toBe(true);
    expect(result.defaultsUsed.pricePerKwh).toBe(true);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(true);
  });

  it('uses provided values when given', () => {
    const result = resolveLeadInputs({
      pvInverterKw: 5.0,
      pricePerKwh: 0.28,
      houseAgeOver10Years: true
    });
    expect(result.pvInverterKw).toBe(5.0);
    expect(result.pricePerKwh).toBe(0.28);
    expect(result.effectiveBtw).toBe(6);
    expect(result.defaultsUsed.pvInverterKw).toBe(false);
    expect(result.defaultsUsed.pricePerKwh).toBe(false);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(false);
  });

  it('houseAgeOver10Years false means 21% BTW', () => {
    const result = resolveLeadInputs({ houseAgeOver10Years: false });
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(false);
  });

  it('houseAgeOver10Years null means 21% BTW and default flagged', () => {
    const result = resolveLeadInputs({ houseAgeOver10Years: null });
    expect(result.effectiveBtw).toBe(21);
    expect(result.defaultsUsed.houseAgeOver10Years).toBe(true);
  });

  it('ignores zero values (treated as not provided)', () => {
    const result = resolveLeadInputs({ pvInverterKw: 0, pricePerKwh: 0 });
    expect(result.pvInverterKw).toBe(3.5);
    expect(result.pricePerKwh).toBe(0.34);
    expect(result.defaultsUsed.pvInverterKw).toBe(true);
    expect(result.defaultsUsed.pricePerKwh).toBe(true);
  });
});

// ─── selectBestConfig ───────────────────────────────────────────────────

describe('selectBestConfig', () => {
  // Helper: create a minimal allDays array (365 days of synthetic data)
  function makeDays(n = 365, afname = 10, injectie = 15) {
    const start = new Date(2025, 0, 1);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        afname, injectie,
        afnamedag: afname / 2, afnamenacht: afname / 2,
        injectiedag: injectie / 2, injectienacht: injectie / 2
      };
    });
  }

  // Helper: create a minimal config
  function makeConfig(type, batCap, batInv, eff, price) {
    return { type, omschrijving: type, batCap, batInv, eff, prices: { '21_yes': price, '6_yes': price * 0.85 } };
  }

  it('returns config with shortest payback', () => {
    const days = makeDays();
    const configs = [
      makeConfig('Big-20', 20, 5, 0.95, 12000),
      makeConfig('Small-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // The smaller, cheaper config should have shorter payback
    expect(result.cfg.type).toBe('Small-5');
  });

  it('tiebreaks on lower capacity', () => {
    const days = makeDays();
    // Two configs with same price/capacity ratio
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
      makeConfig('B-5', 5, 2.5, 0.95, 3000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).not.toBeNull();
    // If payback is equal, lower capacity wins
    if (result.payback === result.payback) {
      expect(result.cfg.batCap).toBeLessThanOrEqual(10);
    }
  });

  it('returns null when all configs give Infinity payback', () => {
    // 0 injection = no solar surplus = Infinity payback
    const days = makeDays(365, 10, 0);
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
    ];
    const result = selectBestConfig(days, configs, 3.5, 0.34, 21);
    expect(result).toBeNull();
  });

  it('uses correct price key for 6% BTW', () => {
    const days = makeDays();
    const configs = [
      makeConfig('A-10', 10, 5, 0.95, 6000),
    ];
    const result6 = selectBestConfig(days, configs, 3.5, 0.34, 6);
    const result21 = selectBestConfig(days, configs, 3.5, 0.34, 21);
    // 6% price is lower (0.85x) so payback should be shorter
    expect(result6).not.toBeNull();
    expect(result21).not.toBeNull();
    expect(result6.payback).toBeLessThan(result21.payback);
  });
});

// ─── buildLeadResult ────────────────────────────────────────────────────

describe('buildLeadResult', () => {
  it('extracts all required fields from configResult', () => {
    const configResult = {
      cfg: { type: 'Test-10', batCap: 10, batInv: 5, eff: 0.95, price: 6000 },
      scenOpt: {
        payback: 6.2,
        recoveryPctFull: 78.5,
        recoveryPctPartial: 94.2,
        qualifyingDays: 187,
        partialDays: 312,
        annualSaving: 485.20,
        annualCharged: 2800
      },
      daysInWindow: 365,
      isFullYear: true
    };
    const result = buildLeadResult(configResult);
    expect(result.bestConfigType).toBe('Test-10');
    expect(result.batteryCapKwh).toBe(10);
    expect(result.batteryInverterKw).toBe(5);
    expect(result.roiYears).toBe(6.2);
    expect(result.recoveryPctFull).toBe(78.5);
    expect(result.recoveryPctPartial).toBe(94.2);
    expect(result.qualifyingDays).toBe(187);
    expect(result.partialDays).toBe(312);
    expect(result.annualSavingEur).toBe(485.20);
    expect(result.daysInWindow).toBe(365);
    expect(result.isFullYear).toBe(true);
  });
});

// ─── buildDefaultsNotes ─────────────────────────────────────────────────

describe('buildDefaultsNotes', () => {
  it('returns empty string when no defaults used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: false,
      pricePerKwh: false,
      houseAgeOver10Years: false
    });
    expect(notes).toBe('');
  });

  it('lists all defaults when all used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: true,
      pricePerKwh: true,
      houseAgeOver10Years: true
    });
    expect(notes).toContain('Standaardwaarden gebruikt:');
    expect(notes).toContain('3,5 kW');
    expect(notes).toContain('0,34 EUR/kWh');
    expect(notes).toContain('21%');
  });

  it('lists only the defaults that were used', () => {
    const notes = buildDefaultsNotes({
      pvInverterKw: true,
      pricePerKwh: false,
      houseAgeOver10Years: false
    });
    expect(notes).toContain('3,5 kW');
    expect(notes).not.toContain('0,34');
    expect(notes).not.toContain('21%');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lead-calc.test.js`

Expected: All tests FAIL with "Not implemented" errors.

- [ ] **Step 4: Commit red phase**

```bash
git add assets/js/lead-calc.js tests/lead-calc.test.js
git commit -m "test(lead-calc): add failing tests for lead calculation module"
```

---

### Task 2: Lead calc module — implementation (TDD green phase)

**Files:**
- Modify: `assets/js/lead-calc.js`

- [ ] **Step 1: Implement resolveLeadInputs**

```javascript
export function resolveLeadInputs(raw) {
  const pvGiven    = typeof raw.pvInverterKw === 'number' && raw.pvInverterKw > 0;
  const priceGiven = typeof raw.pricePerKwh === 'number' && raw.pricePerKwh > 0;
  const houseGiven = raw.houseAgeOver10Years === true || raw.houseAgeOver10Years === false;

  return {
    pvInverterKw: pvGiven ? raw.pvInverterKw : LEAD_DEFAULTS.pvInverterKw,
    pricePerKwh:  priceGiven ? raw.pricePerKwh : LEAD_DEFAULTS.pricePerKwh,
    effectiveBtw: (raw.houseAgeOver10Years === true) ? 6 : LEAD_DEFAULTS.btw,
    defaultsUsed: {
      pvInverterKw:      !pvGiven,
      pricePerKwh:       !priceGiven,
      houseAgeOver10Years: !houseGiven
    }
  };
}
```

- [ ] **Step 2: Implement selectBestConfig**

```javascript
export function selectBestConfig(allDays, configs, pvInverterKw, pricePerKwh, effectiveBtw) {
  const priceKey = `${effectiveBtw}_yes`; // always keuring=yes
  let best = null;

  for (const cfg of configs) {
    const price = cfg.prices[priceKey];
    if (!price || price <= 0) continue;

    const selected = [{ ...cfg, price }];
    const d = processDataPure({ allDays }, pvInverterKw, selected, pricePerKwh, pricePerKwh);
    if (!d || !d.configResults || !d.configResults.length) continue;

    const cr = d.configResults[0];
    const payback = cr.scenOpt.payback;
    if (!isFinite(payback)) continue;

    if (!best || payback < best.payback || (payback === best.payback && cfg.batCap < best.cfg.batCap)) {
      best = {
        cfg: { ...cfg, price },
        scenOpt: cr.scenOpt,
        payback,
        daysInWindow: d.daysInWindow,
        isFullYear: d.isFullYear
      };
    }
  }

  return best;
}
```

- [ ] **Step 3: Implement buildLeadResult**

```javascript
export function buildLeadResult(configResult) {
  const { cfg, scenOpt, daysInWindow, isFullYear } = configResult;
  return {
    bestConfigType:     cfg.type,
    batteryCapKwh:      cfg.batCap,
    batteryInverterKw:  cfg.batInv,
    roiYears:           scenOpt.payback,
    recoveryPctFull:    scenOpt.recoveryPctFull,
    recoveryPctPartial: scenOpt.recoveryPctPartial,
    qualifyingDays:     scenOpt.qualifyingDays,
    partialDays:        scenOpt.partialDays,
    annualSavingEur:    scenOpt.annualSaving,
    daysInWindow,
    isFullYear
  };
}
```

- [ ] **Step 4: Implement buildDefaultsNotes**

```javascript
export function buildDefaultsNotes(defaultsUsed) {
  const lines = [];
  if (defaultsUsed.pvInverterKw) {
    lines.push(`- Omvormervermogen: ${String(LEAD_DEFAULTS.pvInverterKw).replace('.', ',')} kW (niet opgegeven)`);
  }
  if (defaultsUsed.pricePerKwh) {
    lines.push(`- Energiekost: ${String(LEAD_DEFAULTS.pricePerKwh).replace('.', ',')} EUR/kWh (niet opgegeven)`);
  }
  if (defaultsUsed.houseAgeOver10Years) {
    lines.push(`- BTW: ${LEAD_DEFAULTS.btw}% (woningtype niet opgegeven)`);
  }
  return lines.length ? `Standaardwaarden gebruikt:\n${lines.join('\n')}` : '';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lead-calc.test.js`

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite + lint**

Run: `npm run lint && npx vitest run`

Expected: 0 lint errors. All unit tests pass (existing 86 + new lead-calc tests).

- [ ] **Step 7: Commit green phase**

```bash
git add assets/js/lead-calc.js tests/lead-calc.test.js
git commit -m "feat(lead-calc): implement best-ROI selection, defaults, and notes"
```

---

### Task 3: Firebase helpers for leads

**Files:**
- Modify: `assets/js/firebase-init.js`
- Modify: `eslint.config.js`

- [ ] **Step 1: Add lead CRUD functions to firebase-init.js**

Add at the end of `firebase-init.js`, before the closing comments:

```javascript
// ─── LEADS ──────────────────────────────────────────────────────────────

/** Create a new lead document. Returns the auto-generated doc ID. */
async function createLead(leadData) {
  const db = getDb();
  const doc = {
    ...leadData,
    status: 'cold_lead',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    hotLeadAt: null
  };
  const ref = await db.collection('leads').add(doc);
  return ref.id;
}

/** List all leads, ordered by createdAt desc. */
async function listLeads() {
  const db = getDb();
  const snap = await db.collection('leads').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Get a single lead by ID. Returns null if not found. */
async function getLead(leadId) {
  const db = getDb();
  const snap = await db.collection('leads').doc(leadId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Update a lead from cold_lead to hot_lead. */
async function updateLeadToHot(leadId) {
  const db = getDb();
  await db.collection('leads').doc(leadId).update({
    status: 'hot_lead',
    hotLeadAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/** Write a document to the mail collection (triggers Firebase email extension). */
async function createMailDoc(mailData) {
  const db = getDb();
  await db.collection('mail').add(mailData);
}

/**
 * Convert a lead into a project. Creates a new project doc with data from the lead.
 * Returns the new project ID.
 */
async function convertLeadToProject(lead) {
  const projectData = {
    customerName: lead.customerName || '',
    projectName: '',
    status: 'nieuw_contact',
    email: lead.email || '',
    notes: lead.notes || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  // Copy CSV data if available
  if (lead.csvDailyCompact) {
    projectData.csvDailyCompact = lead.csvDailyCompact;
  }
  // Copy calc-relevant fields
  if (lead.pvInverterKw) {
    projectData.solar = { inverters: [{ powerKw: lead.pvInverterKw }] };
  }
  if (lead.pricePerKwh) {
    projectData.supplier = {
      isSingleTariff: true,
      priceDay: lead.pricePerKwh,
      priceNight: lead.pricePerKwh
    };
  }
  if (lead.effectiveBtw) {
    projectData.site = { houseAgeOver10Years: lead.effectiveBtw === 6 };
  }

  const db = getDb();
  const ref = await db.collection('projects').add(projectData);
  return ref.id;
}
```

- [ ] **Step 2: Update ESLint config — add new globals**

In `eslint.config.js`, add the new function names to the `firebaseInitGlobals` map (around lines 4-57):

```javascript
  createLead: 'readonly',
  listLeads: 'readonly',
  getLead: 'readonly',
  updateLeadToHot: 'readonly',
  createMailDoc: 'readonly',
  convertLeadToProject: 'readonly',
```

- [ ] **Step 3: Add lead-calc.js to ESLint ES modules section**

In `eslint.config.js`, find the ES modules file list (around line 75) and add `lead-calc.js`:

```javascript
files: ['assets/js/calc-engine.js', 'assets/js/csv.js', 'assets/js/shared-helpers.js', 'assets/js/lead-calc.js'],
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add assets/js/firebase-init.js eslint.config.js
git commit -m "feat(firebase): add lead CRUD, mail trigger, and lead-to-project conversion"
```

---

### Task 4: Wizard page CSS

**Files:**
- Modify: `assets/css/smartpeak.css`

- [ ] **Step 1: Add wizard and lead result styles to smartpeak.css**

Append to the end of `smartpeak.css`:

```css
/* ── 6. Lead wizard ─────────────────────────────────────────────────────── */

.sp-wizard-steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.sp-wizard-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #c4cadb;
  transition: background 0.2s, transform 0.2s;
}
.sp-wizard-dot.active {
  background: var(--bs-primary, #2c7be5);
  transform: scale(1.25);
}
.sp-wizard-dot.done {
  background: #16a34a;
}

.sp-wizard-step {
  display: none;
  animation: sp-fade-in 0.25s ease;
}
.sp-wizard-step.active { display: block; }

@keyframes sp-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sp-wizard-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.sp-csv-feedback {
  margin-top: 12px;
  font-size: 0.9rem;
}
.sp-csv-feedback.success { color: #16a34a; }
.sp-csv-feedback.error { color: #dc2626; }
.sp-csv-feedback.warning { color: #f59e0b; }

/* ── 7. Lead result page ────────────────────────────────────────────────── */

.sp-lead-result {
  max-width: 540px;
  margin: 0 auto;
  padding: 24px 16px;
}

.sp-result-card {
  background: #fff;
  border-radius: var(--bs-border-radius-lg, 16px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  padding: 28px 24px;
  margin-bottom: 20px;
}

.sp-result-metrics {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-bottom: 20px;
  gap: 12px;
}

.sp-result-metric-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--bs-primary, #2c7be5);
  line-height: 1.1;
}

.sp-result-metric-label {
  font-size: 0.82rem;
  color: #6b7a8d;
  margin-top: 2px;
}

.sp-result-bars {
  margin-top: 16px;
}

.sp-result-bar-label {
  font-size: 0.85rem;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
}

.sp-result-bar {
  height: 10px;
  border-radius: 5px;
  background: #e9ecef;
  margin-bottom: 12px;
  overflow: hidden;
}

.sp-result-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.6s ease;
}
.sp-result-bar-fill.full    { background: #16a34a; }
.sp-result-bar-fill.partial { background: #2c7be5; }

.sp-lead-disclaimer {
  background: #f8f9fa;
  border-radius: var(--bs-border-radius, 12px);
  padding: 16px;
  font-size: 0.85rem;
  color: #495057;
  margin-bottom: 20px;
}

.sp-lead-disclaimer ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.sp-lead-cta {
  text-align: center;
}

.sp-lead-cta .btn {
  font-size: 1.05rem;
  padding: 12px 32px;
}

.sp-lead-cta-done {
  color: #16a34a;
  font-weight: 600;
  font-size: 1.05rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/css/smartpeak.css
git commit -m "style: add wizard step indicator and lead result card CSS"
```

---

### Task 5: Wizard page (`lead.html`)

**Files:**
- Create: `lead.html`

- [ ] **Step 1: Create the wizard HTML page**

Create `lead.html` with the complete wizard implementation. Key structure:

```html
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Batterij-analyse — SmartPeak</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css"
        integrity="sha512-jnSuA4Ss2PkkikSOLtYs8BlYIeeIK1h99ty4YfvRPAlzr377vr3CXDb7sb7eEEBYjDtcYj+AjBH3FLv5uSJuXg=="
        crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="assets/css/smartpeak.css" />
</head>
<body style="background:#f4f6fb;">

<div class="container py-4" style="max-width:560px;">

  <!-- Step indicator -->
  <div class="sp-wizard-steps" id="wizardDots">
    <div class="sp-wizard-dot active"></div>
    <div class="sp-wizard-dot"></div>
    <div class="sp-wizard-dot"></div>
  </div>

  <!-- Step 1: CSV upload -->
  <div class="sp-wizard-step active" id="step1">
    <div class="card">
      <div class="card-body">
        <h5 class="card-title mb-3">Upload je verbruiksgegevens</h5>
        <div class="alert alert-info small">
          <strong>Hoe verkrijg je dit bestand?</strong>
          <ol class="mb-0 mt-1">
            <li>Ga naar <a href="https://mijn.fluvius.be" target="_blank" rel="noopener">mijn.fluvius.be</a></li>
            <li>Log in met je eID of itsme</li>
            <li>Ga naar <em>Mijn verbruik</em> &rarr; <em>Gegevens downloaden</em></li>
            <li>Kies een periode van minstens 1 jaar en download als CSV</li>
          </ol>
        </div>
        <div class="sp-drop-zone" id="csvDropZone">
          <i class="fa-solid fa-cloud-arrow-up fa-2x mb-2" style="color:#8899b4;" aria-hidden="true"></i>
          <div>Sleep je CSV-bestand hierheen of <strong>klik om te bladeren</strong></div>
          <input type="file" id="csvFileInput" accept=".csv" />
        </div>
        <div id="csvFeedback" class="sp-csv-feedback"></div>
        <div class="sp-wizard-nav">
          <div></div>
          <button type="button" class="btn btn-primary" id="btnStep1Next" disabled>
            Volgende <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 2: Contact details -->
  <div class="sp-wizard-step" id="step2">
    <div class="card">
      <div class="card-body">
        <h5 class="card-title mb-3">Jouw gegevens</h5>
        <p class="text-muted small">We sturen je persoonlijk resultaat naar dit emailadres.</p>
        <div class="mb-3">
          <label for="leadName" class="form-label">Naam <span class="text-danger">*</span></label>
          <input type="text" class="form-control" id="leadName" required placeholder="Voornaam en achternaam" />
          <div class="invalid-feedback">Vul je naam in.</div>
        </div>
        <div class="mb-3">
          <label for="leadEmail" class="form-label">Email <span class="text-danger">*</span></label>
          <input type="email" class="form-control" id="leadEmail" required placeholder="jan@voorbeeld.be" />
          <div class="invalid-feedback">Vul een geldig emailadres in.</div>
        </div>
        <div class="sp-wizard-nav">
          <button type="button" class="btn btn-outline-secondary btnBack" data-back="1">
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Terug
          </button>
          <button type="button" class="btn btn-primary" id="btnStep2Next">
            Volgende <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 3: Optional fields -->
  <div class="sp-wizard-step" id="step3">
    <div class="card">
      <div class="card-body">
        <h5 class="card-title mb-3">Optionele gegevens voor een nauwkeuriger resultaat</h5>
        <div class="mb-3">
          <label class="form-label">Is je woning 10 jaar of ouder?</label>
          <div class="form-text mb-2">Bepaalt het BTW-tarief (6% voor oudere woningen, 21% voor nieuwere).</div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="houseAge" id="houseAgeYes" value="true" />
            <label class="form-check-label" for="houseAgeYes">Ja, 10 jaar of ouder</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="houseAge" id="houseAgeNo" value="false" />
            <label class="form-check-label" for="houseAgeNo">Nee, jonger dan 10 jaar</label>
          </div>
          <div class="form-text text-muted mt-1">Niet ingevuld? We rekenen met 21% BTW.</div>
        </div>
        <div class="mb-3">
          <label for="leadPvKw" class="form-label">Totaal omvormervermogen (kW)</label>
          <div class="form-text mb-1">Het piekvermogen van je zonnepanelen-omvormer. Staat vermeld op je omvormer of in de specificaties van je installatie.</div>
          <input type="number" class="form-control" id="leadPvKw" step="0.1" min="0.1" max="100" placeholder="bv. 3.5" />
          <div class="form-text text-muted">Niet ingevuld? We rekenen met 3,5 kW.</div>
        </div>
        <div class="mb-3">
          <label for="leadPrice" class="form-label">Energiekost per kWh (EUR)</label>
          <div class="form-text mb-1">Je totale elektriciteitsprijs per kWh, inclusief alle kosten. Vind je op je energiefactuur.</div>
          <input type="number" class="form-control" id="leadPrice" step="0.01" min="0.01" max="2.00" placeholder="bv. 0.34" />
          <div class="form-text text-muted">Niet ingevuld? We rekenen met 0,34 EUR/kWh.</div>
        </div>
        <div class="sp-wizard-nav">
          <button type="button" class="btn btn-outline-secondary btnBack" data-back="2">
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Terug
          </button>
          <button type="button" class="btn btn-primary" id="btnSubmit">
            <i class="fa-solid fa-calculator" aria-hidden="true"></i> Bereken mijn resultaat
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 4: Confirmation -->
  <div class="sp-wizard-step" id="step4">
    <div class="card">
      <div class="card-body text-center py-5">
        <i class="fa-solid fa-envelope-circle-check fa-3x mb-3" style="color:#16a34a;" aria-hidden="true"></i>
        <h5 class="card-title mb-3">Je resultaat is onderweg!</h5>
        <p>We hebben je persoonlijke batterij-analyse verstuurd naar<br/><strong id="confirmEmail"></strong>.</p>
        <p class="text-muted small">Controleer ook je spam-map. Je resultaat blijft beschikbaar via de link in je email.</p>
      </div>
    </div>
  </div>

</div>

<div class="toast-container position-fixed bottom-0 end-0 p-3" id="toastContainer" style="z-index:1090"></div>

<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js"></script>
<script src="assets/js/firebase-init.js"></script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/js/bootstrap.bundle.min.js"
        integrity="sha512-7Pi/otdlbbCR+LnW+F7PwFcSDJOuUJB3OxtEHbg4vSMvzvJjde4Po1v4BR9Gdc9aXNUNFVUY+SK51wWT8WF0Gg=="
        crossorigin="anonymous" referrerpolicy="no-referrer"></script>

<script type="module">
import { escapeHtml, showToast, withSpinner } from './assets/js/shared-helpers.js';
import { validateCsvHeaders } from './assets/js/csv.js';
import { csvToAllDaysAndMeta, parseSheetConfigs } from './assets/js/calc-engine.js';
import { resolveLeadInputs, selectBestConfig, buildLeadResult, buildDefaultsNotes } from './assets/js/lead-calc.js';
import { extractCsvForStorage } from './assets/js/csv.js';

// ─── STATE ──────────────────────────────────────────────────────────────
let _csvText = null;
let _allDaysResult = null;  // { allDays, eanCode, meterNr, meterType }
let _currentStep = 1;

// ─── WIZARD NAVIGATION ─────────────────────────────────────────────────

function goToStep(n) {
  _currentStep = n;
  document.querySelectorAll('.sp-wizard-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.sp-wizard-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === n);
    dot.classList.toggle('done', i + 1 < n);
  });
}

// Back buttons
document.querySelectorAll('.btnBack').forEach(btn => {
  btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.back)));
});

// ─── STEP 1: CSV ────────────────────────────────────────────────────────

const dropZone = document.getElementById('csvDropZone');
const fileInput = document.getElementById('csvFileInput');
const feedback  = document.getElementById('csvFeedback');
const btnNext1  = document.getElementById('btnStep1Next');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleCsvFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleCsvFile(fileInput.files[0]);
});

function handleCsvFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    feedback.className = 'sp-csv-feedback error';
    feedback.textContent = 'Selecteer een CSV-bestand (.csv).';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const validation = validateCsvHeaders(text);
    if (!validation.valid) {
      feedback.className = 'sp-csv-feedback error';
      feedback.innerHTML = escapeHtml(validation.errors.join(' '));
      _csvText = null;
      _allDaysResult = null;
      btnNext1.disabled = true;
      return;
    }
    try {
      _allDaysResult = csvToAllDaysAndMeta(text);
      _csvText = text;
    } catch (e) {
      feedback.className = 'sp-csv-feedback error';
      feedback.textContent = e.message || 'Fout bij verwerken van CSV.';
      _csvText = null;
      _allDaysResult = null;
      btnNext1.disabled = true;
      return;
    }
    const days = _allDaysResult.allDays.length;
    if (days < 365) {
      feedback.className = 'sp-csv-feedback warning';
      feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> CSV geladen — ${days} dagen verbruiksdata. Minder dan 1 jaar: resultaat wordt geschat op basis van beschikbare periode.`;
    } else {
      feedback.className = 'sp-csv-feedback success';
      feedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> CSV geladen — ${days} dagen verbruiksdata gevonden.`;
    }
    btnNext1.disabled = false;
  };
  reader.readAsText(file);
}

btnNext1.addEventListener('click', () => goToStep(2));

// ─── STEP 2: CONTACT ───────────────────────────────────────────────────

document.getElementById('btnStep2Next').addEventListener('click', () => {
  const name  = document.getElementById('leadName');
  const email = document.getElementById('leadEmail');
  let valid = true;
  if (!name.value.trim()) { name.classList.add('is-invalid'); valid = false; } else { name.classList.remove('is-invalid'); }
  if (!email.value.trim() || !email.validity.valid) { email.classList.add('is-invalid'); valid = false; } else { email.classList.remove('is-invalid'); }
  if (valid) goToStep(3);
});

// ─── STEP 3: SUBMIT ────────────────────────────────────────────────────

document.getElementById('btnSubmit').addEventListener('click', async () => {
  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = true;

  try {
    await withSpinner(async () => {
      // 1. Initialize Firebase (no auth needed for leads)
      initFirebase();

      // 2. Resolve inputs with defaults
      const houseAgeRadio = document.querySelector('input[name="houseAge"]:checked');
      const rawInputs = {
        pvInverterKw: parseFloat(document.getElementById('leadPvKw').value) || 0,
        pricePerKwh:  parseFloat(document.getElementById('leadPrice').value) || 0,
        houseAgeOver10Years: houseAgeRadio ? houseAgeRadio.value === 'true' : null
      };
      const resolved = resolveLeadInputs(rawInputs);

      // 3. Fetch product configs
      const cfg = await getProductsConfig();
      if (!cfg || !cfg.csvUrl) throw new Error('Productconfiguratie niet beschikbaar.');
      const resp = await fetch(cfg.csvUrl);
      if (!resp.ok) throw new Error('Kon productlijst niet ophalen.');
      const configs = parseSheetConfigs(await resp.text());
      if (!configs.length) throw new Error('Geen batterij-configuraties gevonden.');

      // 4. Calculate best ROI
      const best = selectBestConfig(
        _allDaysResult.allDays, configs,
        resolved.pvInverterKw, resolved.pricePerKwh, resolved.effectiveBtw
      );

      // 5. Build lead document
      const csvStorage = extractCsvForStorage(_csvText);
      const notes = buildDefaultsNotes(resolved.defaultsUsed);
      const leadDoc = {
        customerName:       document.getElementById('leadName').value.trim(),
        email:              document.getElementById('leadEmail').value.trim(),
        csvDailyCompact:    csvStorage.dailyCompact,
        pvInverterKw:       resolved.pvInverterKw,
        pricePerKwh:        resolved.pricePerKwh,
        houseAgeOver10Years: rawInputs.houseAgeOver10Years,
        defaultsUsed:       resolved.defaultsUsed,
        notes:              notes,
        result:             best ? buildLeadResult(best) : null,
        effectiveBtw:       resolved.effectiveBtw,
        keuring:            true
      };

      // 6. Save to Firestore
      const leadId = await createLead(leadDoc);

      // 7. Send result email
      const resultUrl = `${window.location.origin}${window.location.pathname.replace('lead.html', 'lead-result.html')}?r=${leadId}`;
      await createMailDoc({
        to: leadDoc.email,
        message: {
          subject: 'Je batterij-analyse is klaar — SmartPeak',
          html: `<p>Hallo ${escapeHtml(leadDoc.customerName)},</p>
                 <p>Je persoonlijke batterij-analyse is klaar! Bekijk je resultaat via onderstaande link:</p>
                 <p><a href="${resultUrl}" style="display:inline-block;padding:12px 24px;background:#2c7be5;color:#fff;text-decoration:none;border-radius:8px;">Bekijk mijn resultaat</a></p>
                 <p>Met vriendelijke groeten,<br/>SmartPeak</p>`
        }
      });

      // 8. Show confirmation
      document.getElementById('confirmEmail').textContent = leadDoc.email;
      goToStep(4);
    }, { message: 'Berekening uitvoeren...' });
  } catch (e) {
    showToast('Er ging iets mis: ' + (e.message || e), 'danger');
    btnSubmit.disabled = false;
  }
});
</script>

</body>
</html>
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lead.html
git commit -m "feat(lead): create multi-step wizard page for public battery ROI analysis"
```

---

### Task 6: Result page (`lead-result.html`)

**Files:**
- Create: `lead-result.html`

- [ ] **Step 1: Create the result page**

Create `lead-result.html`:

```html
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jouw batterij-analyse — SmartPeak</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css"
        integrity="sha512-jnSuA4Ss2PkkikSOLtYs8BlYIeeIK1h99ty4YfvRPAlzr377vr3CXDb7sb7eEEBYjDtcYj+AjBH3FLv5uSJuXg=="
        crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="assets/css/smartpeak.css" />
</head>
<body style="background:#f4f6fb;">

<div class="sp-lead-result" id="resultContainer">
  <p class="sp-empty-state text-center py-5">Laden...</p>
</div>

<div class="toast-container position-fixed bottom-0 end-0 p-3" id="toastContainer" style="z-index:1090"></div>

<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js"></script>
<script src="assets/js/firebase-init.js"></script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/js/bootstrap.bundle.min.js"
        integrity="sha512-7Pi/otdlbbCR+LnW+F7PwFcSDJOuUJB3OxtEHbg4vSMvzvJjde4Po1v4BR9Gdc9aXNUNFVUY+SK51wWT8WF0Gg=="
        crossorigin="anonymous" referrerpolicy="no-referrer"></script>

<script type="module">
import { escapeHtml, showToast } from './assets/js/shared-helpers.js';

const container = document.getElementById('resultContainer');

(async function loadResult() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('r');
  if (!leadId) {
    container.innerHTML = '<p class="text-center text-danger py-5">Ongeldige link — geen resultaat-ID gevonden.</p>';
    return;
  }

  try {
    initFirebase();
    const lead = await getLead(leadId);
    if (!lead) {
      container.innerHTML = '<p class="text-center text-danger py-5">Resultaat niet gevonden. Mogelijk is de link verlopen.</p>';
      return;
    }

    if (!lead.result) {
      // Not profitable
      container.innerHTML = `
        <div class="sp-result-card text-center">
          <h5 class="mb-3">Jouw batterij-analyse</h5>
          <p>Op basis van je verbruiksdata is een thuisbatterij momenteel niet rendabel. Dit kan veranderen bij hogere energieprijzen of een ander verbruikspatroon.</p>
        </div>
        ${renderDisclaimer(lead)}
        ${renderCTA(lead)}
      `;
      wireCTA(leadId, lead);
      return;
    }

    const r = lead.result;
    container.innerHTML = `
      <div class="sp-result-card">
        <h5 class="text-center mb-4">Jouw batterij-analyse</h5>
        <div class="sp-result-metrics">
          <div>
            <div class="sp-result-metric-value">${fmtNl(r.batteryCapKwh, 1)} kWh</div>
            <div class="sp-result-metric-label">Opslagcapaciteit</div>
          </div>
          <div>
            <div class="sp-result-metric-value">${fmtNl(r.batteryInverterKw, 1)} kW</div>
            <div class="sp-result-metric-label">Omvormvermogen</div>
          </div>
          <div>
            <div class="sp-result-metric-value">${fmtNl(r.roiYears, 1)} jaar</div>
            <div class="sp-result-metric-label">Terugverdientijd</div>
          </div>
        </div>
        <div class="sp-result-bars">
          <div class="sp-result-bar-label">
            <span>Volledige lading</span>
            <span>${fmtNl(r.recoveryPctFull, 1)}%</span>
          </div>
          <div class="sp-result-bar">
            <div class="sp-result-bar-fill full" style="width:${Math.min(r.recoveryPctFull, 100)}%"></div>
          </div>
          <div class="sp-result-bar-label">
            <span>Gedeeltelijke lading</span>
            <span>${fmtNl(r.recoveryPctPartial, 1)}%</span>
          </div>
          <div class="sp-result-bar">
            <div class="sp-result-bar-fill partial" style="width:${Math.min(r.recoveryPctPartial, 100)}%"></div>
          </div>
        </div>
      </div>
      ${renderDisclaimer(lead)}
      ${renderCTA(lead)}
    `;
    wireCTA(leadId, lead);
  } catch (e) {
    container.innerHTML = `<p class="text-center text-danger py-5">Kon resultaat niet laden: ${escapeHtml(e.message || String(e))}</p>`;
  }
})();

function fmtNl(n, decimals = 1) {
  return Number(n).toFixed(decimals).replace('.', ',');
}

function renderDisclaimer(lead) {
  const defaults = [];
  if (lead.defaultsUsed) {
    if (lead.defaultsUsed.pvInverterKw) defaults.push('<li>Omvormervermogen: standaardwaarde 3,5 kW gebruikt</li>');
    if (lead.defaultsUsed.pricePerKwh) defaults.push('<li>Energiekost: standaardwaarde 0,34 EUR/kWh gebruikt</li>');
    if (lead.defaultsUsed.houseAgeOver10Years) defaults.push('<li>BTW: 21% (woningtype niet opgegeven)</li>');
  }
  const defaultsHtml = defaults.length ? `<ul>${defaults.join('')}</ul>` : '';
  return `
    <div class="sp-lead-disclaimer">
      <p class="mb-1">Deze berekening is gebaseerd op jouw eigen verbruiksdata en omvat het volledige SmartPeak-pakket: plaatsing, aansluiting in de kast, Bebat-bijdragen, elektriciteitsschema&rsquo;s en keuring. Andere opties zijn mogelijk.</p>
      ${defaultsHtml}
      <p class="mb-0 mt-2"><small>Dit resultaat is een indicatie op basis van de beschikbare gegevens. Voor een nauwkeurige berekening op maat nemen we graag contact met je op.</small></p>
    </div>
  `;
}

function renderCTA(lead) {
  if (lead.status === 'hot_lead') {
    return `<div class="sp-lead-cta">
      <p class="sp-lead-cta-done"><i class="fa-solid fa-circle-check"></i> Aanvraag ontvangen — we nemen snel contact op!</p>
    </div>`;
  }
  return `<div class="sp-lead-cta">
    <button type="button" class="btn btn-primary btn-lg" id="btnContact">
      <i class="fa-solid fa-phone" aria-hidden="true"></i> Contacteer mij voor een vrijblijvend gesprek
    </button>
  </div>`;
}

function wireCTA(leadId, lead) {
  const btn = document.getElementById('btnContact');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Even geduld...';
    try {
      await updateLeadToHot(leadId);

      // Send notification email to Kevin/Ruben
      await createMailDoc({
        to: ['kevin@bloxit.be', 'ledsrepair@gmail.com'],
        message: {
          subject: `Nieuwe contactaanvraag: ${lead.customerName || 'Onbekend'}`,
          html: `<p>Er is een nieuwe contactaanvraag via de batterij-analyse tool:</p>
                 <ul>
                   <li><strong>Naam:</strong> ${escapeHtml(lead.customerName || '')}</li>
                   <li><strong>Email:</strong> ${escapeHtml(lead.email || '')}</li>
                 </ul>
                 <p><a href="https://smartpeak-be.github.io/battery-roi-tool/dashboard.html">Open dashboard</a></p>`
        }
      });

      // Replace button with confirmation
      const ctaDiv = btn.parentElement;
      ctaDiv.innerHTML = '<p class="sp-lead-cta-done"><i class="fa-solid fa-circle-check"></i> Aanvraag ontvangen — we nemen snel contact op!</p>';
    } catch (e) {
      showToast('Er ging iets mis. Probeer opnieuw.', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-phone" aria-hidden="true"></i> Contacteer mij voor een vrijblijvend gesprek';
    }
  });
}
</script>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add lead-result.html
git commit -m "feat(lead): create result permalink page with ROI card and contact CTA"
```

---

### Task 7: Dashboard leads integration

**Files:**
- Modify: `dashboard.html`

- [ ] **Step 1: Add leads section to dashboard HTML**

In `dashboard.html`, after the project list card (after line 118 `</div>` closing `card-body`), add a leads card:

```html
    <!-- Leads -->
    <div class="card mt-3" id="leadsCard" style="display:none;">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fa-solid fa-user-plus me-1" aria-hidden="true"></i> Leads</span>
        <span class="badge bg-primary" id="leadsCount">0</span>
      </div>
      <div class="card-body p-0 p-md-3" id="leadsList"></div>
    </div>
```

- [ ] **Step 2: Add leads rendering logic to dashboard inline JS**

At the end of the `<script type="module">` block (before the resize listener), add:

```javascript
// ─── LEADS SECTION ──────────────────────────────────────────────────────

async function refreshLeads() {
  const card = document.getElementById('leadsCard');
  const el   = document.getElementById('leadsList');
  const badge = document.getElementById('leadsCount');
  try {
    const leads = await listLeads();
    if (!leads.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    badge.textContent = leads.length;
    el.innerHTML = `
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Naam</th>
            <th>Email</th>
            <th>Status</th>
            <th class="d-none d-sm-table-cell">Datum</th>
            <th class="text-end">Acties</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(l => leadRowHTML(l)).join('')}
        </tbody>
      </table>`;
    wireLeadActions(el);
  } catch (_e) {
    card.style.display = 'none';
  }
}

function leadRowHTML(l) {
  const date = l.createdAt ? fmtDate(l.createdAt) : '—';
  const statusLabel = l.status === 'hot_lead' ? 'Hot lead' : 'Cold lead';
  const statusColor = l.status === 'hot_lead' ? '#dc2626' : '#6b7a8d';
  const resultLink = l.result
    ? `<a href="lead-result.html?r=${l.id}" class="btn btn-sm btn-outline-secondary" title="Bekijk resultaat" aria-label="Bekijk resultaat" target="_blank"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></a>`
    : '';
  return `
    <tr>
      <td>${escapeHtml(l.customerName || '')}</td>
      <td><a href="mailto:${escapeHtml(l.email || '')}">${escapeHtml(l.email || '')}</a></td>
      <td><span class="badge" style="background:${statusColor};">${statusLabel}</span></td>
      <td class="d-none d-sm-table-cell text-muted small">${date}</td>
      <td class="text-end">
        <div class="d-flex gap-1 justify-content-end">
          ${resultLink}
          <button type="button" class="btn btn-sm btn-outline-primary convertLeadBtn" data-id="${l.id}" title="Maak project aan" aria-label="Maak project aan"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i></button>
        </div>
      </td>
    </tr>`;
}

function wireLeadActions(el) {
  el.querySelectorAll('.convertLeadBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Lead omzetten naar een project?')) return;
      await withSpinner(async () => {
        try {
          const lead = await getLead(btn.dataset.id);
          if (!lead) { showToast('Lead niet gevonden.', 'danger'); return; }
          const projectId = await convertLeadToProject(lead);
          showToast('Project aangemaakt!', 'success');
          window.open(`project-edit.html?project=${projectId}`, '_blank');
          await refreshLeads();
        } catch (e) {
          showToast('Fout: ' + (e.message || e), 'danger');
        }
      });
    });
  });
}
```

- [ ] **Step 3: Call refreshLeads() after auth**

In the `onAuthStateChanged` callback (around line 171), add `refreshLeads()` after `refreshProjectList(true)`:

```javascript
    refreshProjectList(true);
    refreshLeads();
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add read-only leads section with convert-to-project action"
```

---

### Task 8: Firebase setup documentation

**Files:**
- Create: `docs/superpowers/plans/firebase-lead-setup.md`

- [ ] **Step 1: Document Firebase Console steps**

Create a brief runbook for manual Firebase configuration:

```markdown
# Firebase Setup for Leads Feature

## 1. Firestore Security Rules

Add to the existing rules in Firebase Console (Firestore → Rules):

    match /leads/{leadId} {
      allow read: if true;
      allow create: if request.resource.data.status == 'cold_lead'
                    && request.resource.data.customerName is string
                    && request.resource.data.email is string;
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'hotLeadAt'])
                    && resource.data.status == 'cold_lead'
                    && request.resource.data.status == 'hot_lead';
      allow delete: if isWhitelisted();
    }

    match /mail/{mailId} {
      allow create: if true;
      allow read, update, delete: if false;
    }

Update existing config/products rule:

    match /config/{docId} {
      allow read: if true;        // was: isWhitelisted()
      allow write: if false;
    }

## 2. Firebase Extension: Trigger Email from Firestore

1. Go to Firebase Console → Extensions
2. Install "Trigger Email from Firestore" by Firebase
3. Configure:
   - Email documents collection: `mail`
   - SMTP connection URI: (configure with your email provider)
   - Default FROM address: noreply@smartpeak.be (or similar)

## 3. Verify

- Visit lead.html, complete the wizard
- Check Firestore → leads collection for new document
- Check email inbox for result link
- Click result link, verify page loads
- Click "Contacteer mij", verify status changes to hot_lead
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/firebase-lead-setup.md
git commit -m "docs: add Firebase setup runbook for leads feature"
```

---

### Task 9: E2E tests

**Files:**
- Create: `e2e/tests/lead-wizard.spec.js`
- Create: `e2e/tests/lead-result.spec.js`

- [ ] **Step 1: Create wizard E2E test**

Create `e2e/tests/lead-wizard.spec.js`:

```javascript
// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = 'http://localhost:8000';
const CSV_FIXTURE = path.resolve('e2e/fixtures/test-fluvius.csv');

test.describe('Lead wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/lead.html`);
  });

  test('step 1: shows CSV upload instructions', async ({ page }) => {
    await expect(page.locator('#step1')).toBeVisible();
    await expect(page.locator('#step1')).toContainText('mijn.fluvius.be');
    await expect(page.locator('#btnStep1Next')).toBeDisabled();
  });

  test('step 1: rejects invalid file', async ({ page }) => {
    // Create a temporary non-CSV content
    const fileInput = page.locator('#csvFileInput');
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('invalid,headers\n1,2')
    });
    await expect(page.locator('#csvFeedback')).toContainText('kolom');
    await expect(page.locator('#btnStep1Next')).toBeDisabled();
  });

  test('step 1: accepts valid CSV and shows day count', async ({ page }) => {
    const fileInput = page.locator('#csvFileInput');
    await fileInput.setInputFiles(CSV_FIXTURE);
    await expect(page.locator('#csvFeedback')).toContainText('dagen');
    await expect(page.locator('#btnStep1Next')).toBeEnabled();
  });

  test('step 2: validates required fields', async ({ page }) => {
    // Upload CSV first
    await page.locator('#csvFileInput').setInputFiles(CSV_FIXTURE);
    await page.locator('#btnStep1Next').click();
    await expect(page.locator('#step2')).toBeVisible();

    // Try to proceed without filling fields
    await page.locator('#btnStep2Next').click();
    await expect(page.locator('#leadName')).toHaveClass(/is-invalid/);
    await expect(page.locator('#leadEmail')).toHaveClass(/is-invalid/);

    // Fill and proceed
    await page.fill('#leadName', 'Test Klant');
    await page.fill('#leadEmail', 'test@example.com');
    await page.locator('#btnStep2Next').click();
    await expect(page.locator('#step3')).toBeVisible();
  });

  test('step navigation: back buttons work', async ({ page }) => {
    await page.locator('#csvFileInput').setInputFiles(CSV_FIXTURE);
    await page.locator('#btnStep1Next').click();
    await expect(page.locator('#step2')).toBeVisible();

    // Go back to step 1
    await page.locator('.btnBack[data-back="1"]').click();
    await expect(page.locator('#step1')).toBeVisible();
  });
});
```

- [ ] **Step 2: Create result page E2E test**

Create `e2e/tests/lead-result.spec.js`:

```javascript
// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8000';

test.describe('Lead result page', () => {
  test('shows error for missing lead ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/lead-result.html`);
    await expect(page.locator('#resultContainer')).toContainText('Ongeldige link');
  });

  test('shows error for nonexistent lead ID', async ({ page }) => {
    await page.goto(`${BASE_URL}/lead-result.html?r=nonexistent_id_12345`);
    // Wait for Firebase to respond
    await page.waitForTimeout(3000);
    await expect(page.locator('#resultContainer')).toContainText('niet gevonden');
  });
});
```

- [ ] **Step 3: Run E2E tests**

Run: `npm run test:e2e`

Expected: New lead tests pass (wizard navigation + validation tests don't need Firebase auth). Result page tests pass (error states don't need valid lead data).

- [ ] **Step 4: Run full test suite**

Run: `npm run test:all`

Expected: All unit tests + E2E tests pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/lead-wizard.spec.js e2e/tests/lead-result.spec.js
git commit -m "test(e2e): add Playwright tests for lead wizard and result page"
```

---

### Task 10: Final integration — lint, test, PR

**Files:**
- All previously modified files

- [ ] **Step 1: Run full lint**

Run: `npm run lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run all tests**

Run: `npm run test:all`

Expected: All unit tests + all E2E tests pass.

- [ ] **Step 3: Create PR**

```bash
git push -u origin feat/lead-wizard
gh pr create --base gh-pages \
  --title "feat: add public lead wizard and result page for battery ROI analysis" \
  --body "## Summary
- Multi-step wizard (lead.html) for potential customers to upload Fluvius CSV and get a personalised battery ROI analysis
- Result permalink page (lead-result.html) showing ROI, recovery bars, and contact CTA
- lead-calc.js module for best-config selection with defaults and notes generation
- Firebase lead CRUD helpers (createLead, getLead, updateLeadToHot, convertLeadToProject)
- Dashboard leads section with convert-to-project action
- Firebase setup runbook (security rules + email extension)

## Test plan
- [ ] Unit tests: lead-calc module (resolveLeadInputs, selectBestConfig, buildLeadResult, buildDefaultsNotes)
- [ ] E2E tests: wizard flow (CSV upload, validation, navigation), result page (error states)
- [ ] Manual: complete wizard end-to-end with real Fluvius CSV
- [ ] Manual: verify email delivery after Firebase Extension setup
- [ ] Manual: verify CTA status change (cold_lead → hot_lead)
- [ ] Manual: convert lead to project from dashboard"
```
